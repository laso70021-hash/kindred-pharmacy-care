import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { sendRecordEmail } from '@/lib/management.functions';
import { createStaffAccount } from '@/lib/staff.functions';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { UserPlus, Copy, X, Mail } from 'lucide-react';
import { EntryForm } from './EntryForm';
import { EntryService, WorkspaceService } from '@/lib/pharmacy-service';
import type { EntryRow } from '@/lib/entry-model';
import { Button } from '@/components/ui/button';
import type { Workspace } from '@/lib/pharmacy-types';
import { STAFF_ROLES, can, limitLabel, limitReached, roleLabel, type StaffRole } from '@/lib/workspace';
import { formatDateDeterministic } from '@/lib/utils';
import { cardCls, Empty, Field, Modal, SectionHeader, errorText, ghostBtn, inputCls, primaryBtn } from './ws-ui';

export function inviteLink(email: string): string {
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  return `${origin}/auth?invite=${encodeURIComponent(email)}`;
}

export function whatsappInviteUrl(business: string, email: string, phone?: string | null): string {
  let digits = (phone || '').replace(/\D/g, '');
  if (digits.startsWith('0')) digits = `255${digits.slice(1)}`;
  const text = `You've been invited to join ${business} on Swahivo. Sign up with ${email} here: ${inviteLink(email)}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export function StaffTab({ ws }: { ws: Workspace }) {
  const sendEmail=useServerFn(sendRecordEmail);
  const pid = ws.id;
  const qc = useQueryClient();
  const editable = can(ws.role, 'manageStaff', ws.status);
  const { data: staff = [], isLoading } = useQuery({ queryKey: ['ws', pid, 'staff'], queryFn: () => WorkspaceService.getStaff(pid) });
  const { data: invites = [] } = useQuery({ queryKey: ['ws', pid, 'invites'], queryFn: () => WorkspaceService.getInvites(pid) });
  const { data: branches = [] } = useQuery({ queryKey: ['ws', pid, 'branches'], queryFn: () => WorkspaceService.getBranches(pid) });
  const { data: refs = {} } = useQuery({ queryKey: ['entry-refs', pid], queryFn: () => EntryService.references(pid) });
  const [inviting, setInviting] = useState(false);
  const createAccount = useServerFn(createStaffAccount);
  const [creating, setCreating] = useState(false);
  const [acct, setAcct] = useState({ fullName: '', email: '', password: '', phone: '', jobTitle: '', role: 'cashier' as StaffRole, branchId: '' });
  const [made, setMade] = useState<{ email: string; password: string } | null>(null);
  const genPassword = () => { const c = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'; const a = new Uint32Array(10); crypto.getRandomValues(a); setAcct((x) => ({ ...x, password: Array.from(a, (n) => c[n % c.length]).join('') + '!7' })); };
  const submitAccount = () => void run(async () => {
    await createAccount({ data: { pharmacyId: pid, fullName: acct.fullName, email: acct.email, password: acct.password, phone: acct.phone, jobTitle: acct.jobTitle, role: acct.role as 'cashier', branchIds: acct.branchId ? [acct.branchId] : [] } });
    setMade({ email: acct.email.trim().toLowerCase(), password: acct.password }); setCreating(false);
    setAcct({ fullName: '', email: '', password: '', phone: '', jobTitle: '', role: 'cashier' as StaffRole, branchId: '' });
  }, 'Staff account created');
  const [busy, setBusy] = useState(false);
  const [editing,setEditing]=useState<EntryRow|null>(null);
  const { data: details = [] } = useQuery({ queryKey: ['staff-details',pid], queryFn:()=>EntryService.staffDetails(pid), enabled:editable });

  const activeCount = staff.filter((s) => s.is_active).length;
  const used = activeCount + invites.length;
  const full = ws.role !== 'admin' && limitReached(used, ws.limits.max_employees);

  const refresh = () => {
    void qc.invalidateQueries({queryKey:['staff-details',pid]});
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
            <div className="flex gap-2">
              <button className={primaryBtn} disabled={full} onClick={() => setCreating(true)}>
                <UserPlus className="w-3.5 h-3.5" /> Create account
              </button>
              <button className={ghostBtn} disabled={full} onClick={() => setInviting(true)}>
                <Mail className="w-3.5 h-3.5" /> Invite by email
              </button>
            </div>
          )
        }
      />
      {full && editable && (
        <div className="text-xs bg-amber-50 border border-amber-200 text-amber-900 rounded-xl px-4 py-2.5 font-semibold">
          All staff seats on the {ws.plan_name} plan are used. Upgrade from My Account, or remove someone first.
        </div>
      )}

      {creating && (
        <Modal title="Create staff account" onClose={() => setCreating(false)}>
          <div className="space-y-3">
            <Field label="Full name"><input className={inputCls} value={acct.fullName} onChange={(e) => setAcct({ ...acct, fullName: e.target.value })} /></Field>
            <Field label="Email (their username)"><input className={inputCls} type="email" value={acct.email} onChange={(e) => setAcct({ ...acct, email: e.target.value })} /></Field>
            <Field label="Password" hint="At least 8 characters. Share it privately with the employee.">
              <div className="flex gap-2"><input className={inputCls} value={acct.password} onChange={(e) => setAcct({ ...acct, password: e.target.value })} /><button type="button" className={ghostBtn} onClick={genPassword}>Generate</button></div>
            </Field>
            <Field label="Phone"><input className={inputCls} value={acct.phone} onChange={(e) => setAcct({ ...acct, phone: e.target.value })} /></Field>
            <Field label="Job title"><input className={inputCls} value={acct.jobTitle} onChange={(e) => setAcct({ ...acct, jobTitle: e.target.value })} /></Field>
            <Field label="Role">
              <select className={inputCls} value={acct.role} onChange={(e) => setAcct({ ...acct, role: e.target.value as StaffRole })}>
                {STAFF_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </Field>
            <Field label="Branch">
              <select className={inputCls} value={acct.branchId} onChange={(e) => setAcct({ ...acct, branchId: e.target.value })}>
                <option value="">All branches</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </Field>
            <button className={primaryBtn} disabled={busy || acct.fullName.trim().length < 2 || !acct.email.includes('@') || acct.password.length < 8} onClick={submitAccount}>Create account</button>
          </div>
        </Modal>
      )}
      {made && (
        <Modal title="Account ready" onClose={() => setMade(null)}>
          <div className="space-y-2 text-sm">
            <p>Give these sign-in details to the employee. The password is shown only once.</p>
            <div className="bg-slate-50 rounded-xl p-3 font-mono text-xs">User: {made.email}<br />Password: {made.password}</div>
            <button className={primaryBtn} onClick={() => void navigator.clipboard.writeText(`Swahivo sign-in: ${typeof window === 'undefined' ? '' : window.location.origin}/auth\nUser: ${made.email}\nPassword: ${made.password}`).then(() => toast.success('Copied'))}><Copy className="w-3.5 h-3.5" /> Copy details</button>
          </div>
        </Modal>
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
                    {editable&&<Button variant="link" size="sm" onClick={()=>{const d=details.find(x=>x.id===s.membership_id);const ids=d?.branch_ids?.length?d.branch_ids:d?.branch_id?[d.branch_id]:[];setEditing({id:s.membership_id,full_name:s.full_name,email:s.email,phone:d?.phone??'',staff_id:d?.staff_id??'',job_title:d?.job_title??'',role:s.role,employment_status:d?.employment_status??'active',branch_codes:ids.map((id:string)=>branches.find(b=>b.id===id)?.code??'').join(';')});}}>Edit staff details</Button>}
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
                        onClick={() => { if (s.is_active && !window.confirm(`Suspend ${s.full_name}? They will lose access until reactivated.`)) return; void run(() => WorkspaceService.updateMembership(s.membership_id, { is_active: !s.is_active }), s.is_active ? 'User suspended' : 'User reactivated'); }}
                      >
                        {s.is_active ? 'Suspend' : 'Reactivate'}
                      </button>
                    ) : (
                      <span className="font-semibold">{s.is_active ? 'Active' : 'Suspended'}</span>
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
                  {editable&&<Button variant="outline" size="sm" disabled={busy} onClick={()=>void run(async()=>{await sendEmail({data:{kind:'pharmacy_invites',id:i.id,invite:true}});},'Invitation email sent')}><Mail className="size-3"/>Send email</Button>}
                  <button className={ghostBtn} onClick={() => copy(i.email)}>
                    <Copy className="w-3 h-3" /> Copy link
                  </button>
                  <a className={ghostBtn} target="_blank" rel="noopener noreferrer" href={whatsappInviteUrl(ws.name, i.email, (i as { phone?: string | null }).phone)}>
                    WhatsApp
                  </a>
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

      {inviting && <EntryForm module="staff" references={refs} onClose={()=>setInviting(false)} onSave={async row=>{await EntryService.save(pid,'staff',row);refresh();toast.success('Invitation saved');}} />}
      {editing&&<EntryForm module="staff" initial={editing} references={refs} onClose={()=>setEditing(null)} onSave={async row=>{const id=editing['id'];if(!id)return;await EntryService.updateStaff(pid,id,row);refresh();toast.success('Staff updated');}}/>}

    </div>
  );
}
