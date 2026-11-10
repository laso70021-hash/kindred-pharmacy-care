import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FileText, Check, X } from 'lucide-react';
import type { Workspace } from '@/lib/pharmacy-types';
import { WholesaleService, type WholesaleOrder } from '@/lib/pharmacy-service';
import { isReadOnly } from '@/lib/workspace';
import { formatNumber, formatDateDeterministic } from '@/lib/utils';
import { Empty, SectionHeader, primaryBtn, ghostBtn, cardCls, errorText, inputCls } from './ws-ui';

const STATUS: Record<WholesaleOrder['status'], { l: string; c: string }> = {
  payment_submitted: { l: 'Awaiting supplier', c: 'bg-amber-50 text-amber-700' },
  completed: { l: 'Paid · stocked', c: 'bg-emerald-50 text-emerald-700' },
  rejected: { l: 'Rejected', c: 'bg-rose-50 text-rose-700' },
};

export function OrdersTab({ ws }: { ws: Workspace }) {
  const side = ws.business_type === 'supplier' ? 'supplier' : 'buyer';
  const qc = useQueryClient();
  const { data: orders = [], isLoading } = useQuery({ queryKey: ['wholesale', 'orders', ws.id, side], queryFn: () => WholesaleService.orders(ws.id, side) });
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const readOnly = isReadOnly(ws.status, ws.role);

  const openReceipt = async (path: string) => {
    try { window.open(await WholesaleService.receiptUrl(path), '_blank', 'noopener'); } catch (err) { toast.error(errorText(err)); }
  };
  const review = async (o: WholesaleOrder, d: 'accept' | 'reject') => {
    setBusy(o.id);
    try {
      await WholesaleService.review(o.id, d, notes[o.id] || '');
      toast.success(d === 'accept' ? `Payment confirmed — stock sent to ${o.buyer_name}.` : 'Order rejected.');
      void qc.invalidateQueries({ queryKey: ['wholesale'] });
      void qc.invalidateQueries({ queryKey: ['ws', ws.id] });
    } catch (err) { toast.error(errorText(err)); } finally { setBusy(null); }
  };

  return (
    <div className="space-y-4">
      <SectionHeader title={side === 'supplier' ? 'Wholesale orders' : 'My supplier orders'}
        subtitle={side === 'supplier' ? 'Check the payment reference and receipt, then accept to release stock to the pharmacy.' : 'Track orders you placed with suppliers.'} />
      {isLoading ? <Empty>Loading orders…</Empty> : orders.length === 0 ? <Empty>No orders yet.</Empty> : orders.map((o) => (
        <div key={o.id} className={`${cardCls} p-4 space-y-3`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="font-black text-sm">{o.order_number} · {side === 'supplier' ? o.buyer_name : o.supplier_name}</div>
              <div className="text-[11px] text-slate-500">{formatDateDeterministic(o.created_at)} · deliver to {o.branch_name}</div>
            </div>
            <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${STATUS[o.status].c}`}>{STATUS[o.status].l}</span>
          </div>
          <ul className="text-xs divide-y divide-slate-100">{o.items.map((i, k) => (
            <li key={k} className="flex justify-between py-1"><span>{i.quantity} × {i.product_name} @ {formatNumber(i.unit_price)}</span><span className="font-bold">{formatNumber(i.total_price)}</span></li>))}</ul>
          <div className="grid sm:grid-cols-3 gap-2 text-xs bg-slate-50 rounded-xl p-3">
            <div><span className="text-slate-500">Total</span><div className="font-black">TZS {formatNumber(o.total_amount)}</div></div>
            <div><span className="text-slate-500">{o.payment_method.toUpperCase()} reference</span><div className="font-bold font-mono">{o.payment_reference || '—'}</div></div>
            <div><span className="text-slate-500">Receipt</span><div>{o.receipt_path ? <button className="text-blue-600 font-bold inline-flex items-center gap-1" onClick={() => openReceipt(o.receipt_path!)}><FileText className="w-3.5 h-3.5" />View</button> : '—'}</div></div>
          </div>
          {o.supplier_note && <p className="text-xs text-slate-600">Supplier note: {o.supplier_note}</p>}
          {side === 'supplier' && o.status === 'payment_submitted' && (
            <div className="flex flex-col sm:flex-row gap-2">
              <input className={inputCls} placeholder="Note to pharmacy (optional)" value={notes[o.id] || ''} onChange={(e) => setNotes({ ...notes, [o.id]: e.target.value })} />
              <button className={primaryBtn} disabled={busy === o.id || readOnly} onClick={() => review(o, 'accept')}><Check className="w-3.5 h-3.5" /> Accept & confirm</button>
              <button className={ghostBtn} disabled={busy === o.id || readOnly} onClick={() => review(o, 'reject')}><X className="w-3.5 h-3.5" /> Reject</button>
            </div>)}
        </div>))}
    </div>
  );
}
