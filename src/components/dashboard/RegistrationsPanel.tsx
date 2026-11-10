import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Building2, Truck, Search, Check, X, CalendarPlus, FileText, ExternalLink } from 'lucide-react';
import { PharmacyService } from '@/lib/pharmacy-service';
import { formatNumber, formatDateDeterministic } from '@/lib/utils';
import { STATUS_LABELS, TRIAL_DAYS, daysLeft, paymentMethodLabel, type AccountStatus } from '@/lib/billing';
import type { BusinessRegistration } from '@/lib/pharmacy-types';

export const REGISTRATIONS_QUERY_KEY = ['admin-registrations'] as const;

export function useRegistrations(enabled = true) {
  return useQuery({
    queryKey: REGISTRATIONS_QUERY_KEY,
    queryFn: () => PharmacyService.getRegistrations(),
    enabled,
  });
}

const TABS: { id: 'needs-action' | AccountStatus | 'all'; label: string }[] = [
  { id: 'needs-action', label: 'Needs action' },
  { id: 'pending', label: 'Pending' },
  { id: 'trial', label: 'Trial' },
  { id: 'active', label: 'Active' },
  { id: 'expired', label: 'Expired' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'all', label: 'All' },
];

const statusBadge: Record<AccountStatus, string> = {
  pending: 'bg-amber-100 text-amber-800',
  trial: 'bg-blue-100 text-blue-800',
  active: 'bg-emerald-100 text-emerald-800',
  expired: 'bg-rose-100 text-rose-800',
  suspended: 'bg-slate-200 text-slate-700',
  rejected: 'bg-rose-100 text-rose-800',
};

export function needsAction(r: BusinessRegistration): boolean {
  return r.effective_status === 'pending' || r.payments.some((p) => p.status === 'pending');
}

export function RegistrationsPanel() {
  const queryClient = useQueryClient();
  const { data: registrations = [], isLoading } = useRegistrations();
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('needs-action');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: registrations.length, 'needs-action': 0 };
    for (const r of registrations) {
      c[r.effective_status] = (c[r.effective_status] || 0) + 1;
      if (needsAction(r)) c['needs-action'] = (c['needs-action'] || 0) + 1;
    }
    return c;
  }, [registrations]);

  const rows = registrations.filter((r) => {
    if (tab === 'needs-action' && !needsAction(r)) return false;
    if (tab !== 'all' && tab !== 'needs-action' && r.effective_status !== tab) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [r.name, r.owner_name, r.email, r.phone, r.city].some((v) => (v || '').toLowerCase().includes(q));
  });

  const run = async (id: string, action: () => Promise<void>, success: string) => {
    setBusyId(id);
    try {
      await action();
      toast.success(success);
      await queryClient.invalidateQueries({ queryKey: REGISTRATIONS_QUERY_KEY });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusyId(null);
    }
  };

  const openReceipt = async (path: string) => {
    try {
      const url = await PharmacyService.getReceiptUrl(path);
      window.open(url, '_blank', 'noopener');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Receipt not available');
    }
  };

  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-2xs space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-slate-900">Registrations & Approvals</h2>
          <p className="text-xs text-slate-500">
            New pharmacies and suppliers, their chosen plan and yearly payments. Approve to start the {TRIAL_DAYS}-day trial or the paid year.
          </p>
        </div>
        <div className="relative sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, owner, phone, city…"
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 text-xs"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              tab === t.id ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {t.label} <span className="opacity-70">({counts[t.id] || 0})</span>
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-xs text-slate-500">Loading registrations…</div>
      ) : rows.length === 0 ? (
        <div className="p-8 text-center text-xs text-slate-500 bg-slate-50 rounded-xl">Nothing here right now.</div>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => {
            const TypeIcon = r.business_type === 'supplier' ? Truck : Building2;
            const busy = busyId === r.id;
            const pendingPayments = r.payments.filter((p) => p.status === 'pending');
            return (
              <div key={r.id} className="rounded-2xl border border-slate-200 p-4 space-y-3">
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                      <TypeIcon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-extrabold text-sm text-slate-900">{r.name}</span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">
                          {r.business_type === 'supplier' ? 'Supplier' : 'Pharmacy'}
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${statusBadge[r.effective_status]}`}>
                          {STATUS_LABELS[r.effective_status]}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1">
                        {r.owner_name || 'Owner'} · {r.email || '—'} · {r.phone || '—'} · {[r.address, r.city].filter(Boolean).join(', ')}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Licence: {r.registration_number || '—'} · TIN: {r.tax_number || '—'} · Registered {formatDateDeterministic(r.created_at)}
                      </div>
                    </div>
                  </div>
                  <div className="text-xs lg:text-right shrink-0">
                    <div className="font-bold text-slate-900">
                      {r.plan_name} · {r.yearly_price ? `TZS ${formatNumber(r.yearly_price)}/yr` : 'Custom price'}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {r.billing_choice === 'trial' ? `Starts with ${TRIAL_DAYS}-day free trial` : 'Pays yearly'}
                      {r.effective_status === 'trial' && ` · ${daysLeft(r.trial_ends_at)} days left`}
                      {r.effective_status === 'active' && r.subscription_ends_at && ` · until ${formatDateDeterministic(r.subscription_ends_at)}`}
                    </div>
                  </div>
                </div>

                {pendingPayments.map((p) => (
                  <div key={p.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs">
                    <div className="flex items-center gap-2 text-amber-900">
                      <FileText className="w-4 h-4" />
                      <span>
                        <b>Payment to verify:</b> TZS {formatNumber(p.amount_tzs)} · {paymentMethodLabel(p.method)} · Ref: <b>{p.reference || '—'}</b> · {formatDateDeterministic(p.created_at)}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      {p.receipt_path && (
                        <button onClick={() => void openReceipt(p.receipt_path!)} className="px-2.5 py-1 rounded-lg bg-white border border-amber-300 font-bold text-amber-900 flex items-center gap-1">
                          <ExternalLink className="w-3 h-3" /> Receipt
                        </button>
                      )}
                      <button
                        disabled={busy}
                        onClick={() => void run(r.id, () => PharmacyService.reviewPayment(p.id, 'confirm'), 'Payment confirmed — account active for 12 months.')}
                        className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold disabled:opacity-60"
                      >
                        Confirm payment
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => {
                          const note = window.prompt('Why is this payment rejected?') ?? '';
                          if (!note) return;
                          void run(r.id, () => PharmacyService.reviewPayment(p.id, 'reject', note), 'Payment rejected.');
                        }}
                        className="px-2.5 py-1 rounded-lg bg-white border border-rose-200 text-rose-700 font-bold disabled:opacity-60"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}

                <div className="flex flex-wrap gap-2">
                  {(r.effective_status === 'pending' || r.effective_status === 'rejected') && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        void run(
                          r.id,
                          () => PharmacyService.reviewRegistration(r.id, 'approve'),
                          r.billing_choice === 'trial' ? `Approved — ${TRIAL_DAYS}-day trial started.` : 'Approved — paid year started.',
                        )
                      }
                      className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1 disabled:opacity-60"
                    >
                      <Check className="w-3.5 h-3.5" /> Approve{r.billing_choice === 'trial' ? ' & start trial' : ''}
                    </button>
                  )}
                  {r.effective_status === 'pending' && (
                    <button
                      disabled={busy}
                      onClick={() => {
                        const note = window.prompt('Reason for rejecting this registration (shown to the applicant):') ?? '';
                        if (!note) return;
                        void run(r.id, () => PharmacyService.reviewRegistration(r.id, 'reject', note), 'Registration rejected.');
                      }}
                      className="px-3 py-1.5 rounded-lg bg-white border border-rose-200 text-rose-700 text-xs font-bold flex items-center gap-1 disabled:opacity-60"
                    >
                      <X className="w-3.5 h-3.5" /> Reject
                    </button>
                  )}
                  {(r.effective_status === 'trial' || (r.effective_status === 'expired' && r.billing_choice === 'trial')) && (
                    <button
                      disabled={busy}
                      onClick={() => void run(r.id, () => PharmacyService.extendTrial(r.id, TRIAL_DAYS), `Trial extended by ${TRIAL_DAYS} days.`)}
                      className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1 disabled:opacity-60"
                    >
                      <CalendarPlus className="w-3.5 h-3.5" /> Extend trial +{TRIAL_DAYS} days
                    </button>
                  )}
                  {r.review_note && <span className="text-[11px] text-slate-500 self-center">Note: {r.review_note}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
