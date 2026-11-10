import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { GitBranch, Plus, Star, MapPin, Phone, Pencil, Power } from 'lucide-react';
import { WorkspaceService } from '@/lib/pharmacy-service';
import type { Workspace, WsBranch } from '@/lib/pharmacy-types';
import { can, limitLabel, limitReached } from '@/lib/workspace';
import { cardCls, Empty, Field, Modal, SectionHeader, errorText, ghostBtn, inputCls, primaryBtn } from './ws-ui';

export function BranchesTab({ ws }: { ws: Workspace }) {
  const pid = ws.id;
  const qc = useQueryClient();
  const editable = can(ws.role, 'manageBranches', ws.status);
  const { data: branches = [], isLoading } = useQuery({ queryKey: ['ws', pid, 'branches'], queryFn: () => WorkspaceService.getBranches(pid) });
  const { data: products = [] } = useQuery({ queryKey: ['ws', pid, 'products'], queryFn: () => WorkspaceService.getProducts(pid) });
  const [editing, setEditing] = useState<Partial<WsBranch> | null>(null);
  const [busy, setBusy] = useState(false);
  const full = ws.role !== 'admin' && limitReached(branches.length, ws.limits.max_branches);

  const refresh = () => void qc.invalidateQueries({ queryKey: ['ws', pid, 'branches'] });

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

  const unitsAt = (branchId: string) => products.reduce((a, p) => a + (p.stock_by_branch[branchId] || 0), 0);

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Branches"
        subtitle={`Main shop and other branches · ${limitLabel(branches.length, ws.limits.max_branches)} on the ${ws.plan_name} plan`}
        action={
          editable && (
            <button className={primaryBtn} disabled={full} onClick={() => setEditing({})} title={full ? 'Upgrade your plan to add more branches' : undefined}>
              <Plus className="w-3.5 h-3.5" /> Add branch
            </button>
          )
        }
      />
      {full && editable && (
        <div className="text-xs bg-amber-50 border border-amber-200 text-amber-900 rounded-xl px-4 py-2.5 font-semibold">
          You&apos;ve used all branches on the {ws.plan_name} plan. Upgrade from My Account to open more.
        </div>
      )}

      {isLoading ? (
        <Empty>Loading branches…</Empty>
      ) : branches.length === 0 ? (
        <Empty>No branches yet. {editable ? 'Add your main branch to start receiving stock.' : ''}</Empty>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {branches.map((b) => (
            <div key={b.id} className={`${cardCls} p-4 space-y-3 ${b.is_active ? '' : 'opacity-60'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                    <GitBranch className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-black text-slate-900 text-sm">{b.name}</div>
                    <div className="text-[11px] text-slate-400 font-semibold">{b.code || 'No code'}</div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {b.is_main && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-600 text-white flex items-center gap-1">
                      <Star className="w-3 h-3" /> Main
                    </span>
                  )}
                  {!b.is_active && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-600">Closed</span>}
                </div>
              </div>
              <div className="text-xs text-slate-500 space-y-1">
                <div className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> {b.address || 'No address'}</div>
                <div className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" /> {b.phone || 'No phone'}</div>
              </div>
              <div className="text-xs font-bold text-slate-700 bg-slate-50 rounded-lg px-3 py-2 border border-slate-200/80">
                {unitsAt(b.id).toLocaleString()} units in stock
              </div>
              {editable && (
                <div className="flex flex-wrap gap-2">
                  <button className={ghostBtn} disabled={busy} onClick={() => setEditing(b)}>
                    <Pencil className="w-3 h-3" /> Edit
                  </button>
                  {!b.is_main && b.is_active && (
                    <button className={ghostBtn} disabled={busy} onClick={() => void run(() => WorkspaceService.setMainBranch(pid, b.id), `${b.name} is now the main branch`)}>
                      <Star className="w-3 h-3" /> Make main
                    </button>
                  )}
                  {!b.is_main && (
                    <button
                      className={ghostBtn}
                      disabled={busy}
                      onClick={() => void run(() => WorkspaceService.setBranchActive(b.id, !b.is_active), b.is_active ? 'Branch closed' : 'Branch reopened')}
                    >
                      <Power className="w-3 h-3" /> {b.is_active ? 'Close' : 'Reopen'}
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {editing && (
        <BranchForm
          initial={editing}
          isFirst={branches.length === 0}
          busy={busy}
          onClose={() => setEditing(null)}
          onSave={(input) =>
            void run(async () => {
              await WorkspaceService.saveBranch(pid, input);
              setEditing(null);
            }, input.id ? 'Branch updated' : 'Branch added')
          }
        />
      )}
    </div>
  );
}

function BranchForm({
  initial,
  isFirst,
  busy,
  onClose,
  onSave,
}: {
  initial: Partial<WsBranch>;
  isFirst: boolean;
  busy: boolean;
  onClose: () => void;
  onSave: (input: { id?: string; name: string; code: string; address: string; phone: string }) => void;
}) {
  const [name, setName] = useState(initial.name ?? (isFirst ? 'Main Branch' : ''));
  const [code, setCode] = useState(initial.code ?? (isFirst ? 'MAIN' : ''));
  const [address, setAddress] = useState(initial.address ?? '');
  const [phone, setPhone] = useState(initial.phone ?? '');
  return (
    <Modal title={initial.id ? 'Edit branch' : 'Add branch'} onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          onSave({ ...(initial.id ? { id: initial.id } : {}), name: name.trim(), code: code.trim(), address: address.trim(), phone: phone.trim() });
        }}
      >
        {isFirst && <p className="text-xs text-blue-800 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">Your first branch becomes the main branch.</p>}
        <Field label="Branch name"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required /></Field>
        <Field label="Short code"><input className={inputCls} value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. KKO" /></Field>
        <Field label="Address"><input className={inputCls} value={address} onChange={(e) => setAddress(e.target.value)} /></Field>
        <Field label="Phone"><input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
        <button type="submit" disabled={busy} className={`${primaryBtn} w-full justify-center py-2.5`}>
          {busy ? 'Saving…' : 'Save branch'}
        </button>
      </form>
    </Modal>
  );
}
