import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { UserPlus, Copy, X, Mail } from 'lucide-react';
import { WorkspaceService } from '@/lib/pharmacy-service';
import type { Workspace } from '@/lib/pharmacy-types';
import { STAFF_ROLES, can, limitLabel, limitReached, roleLabel, type StaffRole } from '@/lib/workspace';
import { formatDateDeterministic } from '@/lib/utils';
import { cardCls, Empty, Field, Modal, SectionHeader, errorText, ghostBtn, inputCls, primaryBtn } from './ws-ui';

export function inviteLink(email: string): string {
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  return `${origin}/auth?invite=${encodeURIComponent(email)}`;
}

export function StaffTab({ ws }: { ws: Workspace }) {
  const pid = ws.id;
  const qc = useQueryClient();
  const editable = can(ws.role, 'manageStaff', ws.status);
  const { data: staff = [], isLoading } = useQuery({ queryKey: ['ws', pid, 'staff'], queryFn: () => WorkspaceService.getStaff(pid) });
  const { data: invites = [] } = useQuery({ queryKey: ['ws', pid, 'invites'], queryFn: () => WorkspaceService.getInvites(pid) });
  const { data: branches = [] } = useQuery({ queryKey: ['ws', pid, 'branches'], queryFn: () => WorkspaceService.getBranches(pid) });
  const [inviting, setInviting] = useState(false);
  const [busy, setBusy] = useState(false);

  const activeCount = staff.filter((s) => s.is_active).length;
  const used = activeCount + invites.length;
  const full = ws.role !== 'admin' && limitReached(used, ws.limits.max_employees);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['ws', pid, 'staff'] });
    void qc.invalidateQueries({ queryKey: ['ws', pid, 'invites'] });
  };
  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      refresh();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  const copy = (email: string) => {
    void navigator.clipboard.writeText(inviteLink(email)).then(() => toast.success('Invite link copied'));
  };

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Staff & Roles"
        subtitle={`${limitLabel(used, ws.limits.max_employees)} staff seats used on the ${ws.plan_name} plan (pending invites count)`}
        action={
          editable && (
            <button className={primaryBtn} disabled={full} onClick={() => setInviting(true)}>
              <UserPlus className="w-3.5 h-3.5" /> Invite staff
            </button>
          )
        }
      />
      {full && editable && (
        <div className="text-xs bg-amber-50 border border-amber-200 text-amber-900 rounded-xl px-4 py-2.5 font-semibold">
          All staff seats on the {ws.plan_name} plan are used. Upgrade from My Account, or remove someone first.
        </div>
      )}

      <div className={`${cardCls} p-5 overflow-x-auto`}>
        <h3 className="font-black text-slate-900 text-sm mb-3">Team</h3>
        {isLoading ? (
          <Empty>Loading team…</Empty>
        ) : staff.length === 0 ? (
          <Empty>No staff yet. Invite your pharmacists, cashiers and managers.</Empty>
        ) : (
          <table className="w-full text-left text-xs min-w-[640px]">
            <thead>
              <tr className="border-b border-slate-200 text-slate-400 uppercase text-[10px] font-bold">
                <th className="py-2">Name</th>
                <th className="py-2">Role</th>
                <th className="py-2">Branch</th>
                <th className="py-2">Joined</th>
                <th className="py-2 text-right">Access</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {staff.map((s) => (
                <tr key={s.membership_id} className={s.is_active ? '' : 'opacity-50'}>
                  <td className="py-2.5">
                    <div className="font-bold text-slate-900">{s.full_name}</div>
                    <div className="text-slate-400">{s.email}</div>
                  </td>
                  <td className="py-2.5">
                    {editable ? (
                      <select
                        aria-label={`Role for ${s.full_name}`}
                        className="px-2 py-1 rounded-lg border border-slate-200 bg-white text-xs font-semibold"
                        value={s.role}
                        disabled={busy}
                        onChange={(e) => void run(() => WorkspaceService.updateMembership(s.membership_id, { role: e.target.value as StaffRole }), 'Role updated')}
                      >
                        {STAFF_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </select>
                    ) : (
                      <span className="font-semibold">{roleLabel(s.role)}</span>
                    )}
                  </td>
                  <td className="py-2.5">
                    {editable ? (
                      <select
                        aria-label={`Branch for ${s.full_name}`}
                        className="px-2 py-1 rounded-lg border border-slate-200 bg-white text-xs font-semibold"
                        value={s.branch_id ?? ''}
                        disabled={busy}
                        onChange={(e) => void run(() => WorkspaceService.updateMembership(s.membership_id, { branch_id: e.target.value || null }), 'Branch updated')}
                      >
                        <option value="">All branches</option>
                        {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                    ) : (
                      branches.find((b) => b.id === s.branch_id)?.name ?? 'All branches'
                    )}
                  </td>
                  <td className="py-2.5 text-slate-500">{formatDateDeterministic(s.created_at)}</td>
                  <td className="py-2.5 text-right">
                    {editable ? (
                      <button
                        className={ghostBtn}
                        disabled={busy}
                        onClick={() => void run(() => WorkspaceService.updateMembership(s.membership_id, { is_active: !s.is_active }), s.is_active ? 'Access removed' : 'Access restored')}
                      >
                        {s.is_active ? 'Remove access' : 'Restore'}
                      </button>
                    ) : (
                      <span className="font-semibold">{s.is_active ? 'Active' : 'Removed'}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className={`${cardCls} p-5`}>
        <h3 className="font-black text-slate-900 text-sm mb-1">Pending invitations</h3>
        <p className="text-xs text-slate-500 mb-3">
          Share the invite link. The person signs up with that email, confirms it, and accepts from their account page.
        </p>
        {invites.length === 0 ? (
          <Empty>No pending invitations.</Empty>
        ) : (
          <ul className="divide-y divide-slate-100 text-xs">
            {invites.map((i) => (
              <li key={i.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-slate-400" />
                  <div>
                    <div className="font-bold text-slate-900">{i.full_name || i.email}</div>
                    <div className="text-slate-400">
                      {i.email} · {roleLabel(i.role)} · {branches.find((b) => b.id === i.branch_id)?.name ?? 'All branches'}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button className={ghostBtn} onClick={() => copy(i.email)}>
                    <Copy className="w-3 h-3" /> Copy link
                  </button>
                  {editable && (
                    <button className={ghostBtn} disabled={busy} onClick={() => void run(() => WorkspaceService.revokeInvite(i.id), 'Invitation cancelled')}>
                      <X className="w-3 h-3" /> Cancel
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {inviting && (
        <InviteForm
          branches={branches.map((b) => ({ id: b.id, name: b.name }))}
          busy={busy}
          onClose={() => setInviting(false)}
          onSave={(input) =>
            void run(async () => {
              await WorkspaceService.inviteStaff(pid, input);
              setInviting(false);
              void navigator.clipboard?.writeText(inviteLink(input.email)).catch(() => undefined);
            }, 'Invitation created — link copied to share')
          }
        />
      )}
    </div>
  );
}

function InviteForm({
  branches,
  busy,
  onClose,
  onSave,
}: {
  branches: { id: string; name: string }[];
  busy: boolean;
  onClose: () => void;
  onSave: (input: { email: string; full_name: string; role: StaffRole; branch_id: string | null }) => void;
}) {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<StaffRole>('cashier');
  const [branchId, setBranchId] = useState('');
  return (
    <Modal title="Invite a staff member" onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ email, full_name: fullName.trim(), role, branch_id: branchId || null });
        }}
      >
        <Field label="Full name"><input className={inputCls} value={fullName} onChange={(e) => setFullName(e.target.value)} /></Field>
        <Field label="Email"><input type="email" required className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Role">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {STAFF_ROLES.map((r) => (
              <button
                type="button"
                key={r.value}
                onClick={() => setRole(r.value)}
                className={`text-left px-3 py-2 rounded-xl border text-xs transition-colors ${role === r.value ? 'border-blue-600 bg-blue-50 ring-1 ring-blue-600' : 'border-slate-200 hover:bg-slate-50'}`}
              >
                <div className="font-bold text-slate-900">{r.label}</div>
                <div className="text-[11px] text-slate-500">{r.description}</div>
              </button>
            ))}
          </div>
        </Field>
        <Field label="Branch">
          <select className={inputCls} value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="">All branches</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </Field>
        <button type="submit" disabled={busy} className={`${primaryBtn} w-full justify-center py-2.5`}>
          {busy ? 'Sending…' : 'Create invitation'}
        </button>
      </form>
    </Modal>
  );
}
