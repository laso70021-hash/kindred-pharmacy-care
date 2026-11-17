import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Copy, ExternalLink, MessageCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { Workspace } from '@/lib/pharmacy-types';
import { formatDateDeterministic } from '@/lib/utils';
import { trackingUrl, whatsappTrackingUrl } from '@/lib/delivery-links';
import { cardCls, Empty, Field, Modal, SectionHeader, errorText, ghostBtn, inputCls, primaryBtn } from './ws-ui';

const NEXT: Record<string, [string, string] | undefined> = {
  pending: ['accepted', 'Accept'], accepted: ['picked_up', 'Picked up'], picked_up: ['in_transit', 'In transit'], in_transit: ['arrived', 'Out for delivery'],
};
const LABEL: Record<string, string> = { pending: 'Waiting for rider', accepted: 'Rider assigned', picked_up: 'Picked up', in_transit: 'In transit', arrived: 'Out for delivery', delivered: 'Delivered', cancelled: 'Cancelled' };

type Job = { id: string; tracking_number: string; status: string; dropoff_address: string; recipient_name: string | null; recipient_phone: string | null; created_at: string };

export function DeliveriesTab({ ws }: { ws: Workspace }) {
  const qc = useQueryClient();
  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ['deliveries', ws.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('delivery_jobs').select('id,tracking_number,status,dropoff_address,recipient_name,recipient_phone,created_at').eq('pharmacy_id', ws.id).order('created_at', { ascending: false }).limit(200);
      if (error) throw error;
      return (data ?? []) as Job[];
    },
  });
  const [share, setShare] = useState<Job | null>(null);
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState<{ job: Job; text: string } | null>(null);
  const refresh = () => void qc.invalidateQueries({ queryKey: ['deliveries', ws.id] });

  const advance = async (j: Job, status: string) => {
    const { error } = await supabase.rpc('advance_delivery_job', { _job: j.id, _status: status, _lat: null as unknown as number, _lng: null as unknown as number, _note: null as unknown as string, _signature: null as unknown as string, _signed_name: null as unknown as string });
    if (error) toast.error(errorText(error)); else { toast.success('Status updated'); refresh(); }
  };
  const saveNote = async () => {
    if (!note?.text.trim()) return;
    const { error } = await supabase.rpc('add_delivery_note', { _job: note.job.id, _note: note.text.trim(), _lat: null as unknown as number, _lng: null as unknown as number });
    if (error) toast.error(errorText(error)); else { toast.success('Update added'); setNote(null); }
  };

  return (
    <div className="space-y-5">
      <SectionHeader title="Deliveries & Tracking" subtitle="Share each tracking link with the customer on WhatsApp so they can follow their order." />
      <div className={`${cardCls} p-5 overflow-x-auto`}>
        {isLoading ? <Empty>Loading deliveries…</Empty> : jobs.length === 0 ? <Empty>No deliveries yet. Send a sale to a rider from the Cashier screen.</Empty> : (
          <table className="w-full text-left text-xs min-w-[760px]">
            <thead><tr className="border-b border-slate-200 text-slate-400 uppercase text-[10px] font-bold">
              <th className="py-2">Tracking</th><th className="py-2">Customer</th><th className="py-2">Address</th><th className="py-2">Status</th><th className="py-2 text-right">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {jobs.map((j) => {
                const url = trackingUrl(j.id);
                const nxt = NEXT[j.status];
                return (
                  <tr key={j.id}>
                    <td className="py-2.5"><div className="font-black text-slate-900">{j.tracking_number}</div><div className="text-slate-400">{formatDateDeterministic(j.created_at)}</div></td>
                    <td className="py-2.5"><div className="font-semibold">{j.recipient_name || '—'}</div><div className="text-slate-400">{j.recipient_phone}</div></td>
                    <td className="py-2.5 max-w-[200px]">{j.dropoff_address}</td>
                    <td className="py-2.5"><span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-bold">{LABEL[j.status] ?? j.status}</span></td>
                    <td className="py-2.5">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <a className={ghostBtn} href={url} target="_blank" rel="noreferrer"><ExternalLink className="w-3.5 h-3.5" /> Tracking link</a>
                        <button className={ghostBtn} onClick={() => void navigator.clipboard.writeText(url).then(() => toast.success('Link copied'))}><Copy className="w-3.5 h-3.5" /></button>
                        <button className={primaryBtn} onClick={() => { setShare(j); setPhone(j.recipient_phone ?? ''); }}><MessageCircle className="w-3.5 h-3.5" /> WhatsApp</button>
                        {nxt && <button className={ghostBtn} onClick={() => void advance(j, nxt[0])}>{nxt[1]}</button>}
                        {!['delivered', 'cancelled'].includes(j.status) && <button className={ghostBtn} onClick={() => setNote({ job: j, text: '' })}>Add update</button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {share && (
        <Modal title={`Share ${share.tracking_number} on WhatsApp`} onClose={() => setShare(null)}>
          <div className="space-y-3">
            <Field label="Customer WhatsApp number" hint="e.g. 0712 345 678 or +255712345678">
              <input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0712 345 678" inputMode="tel" />
            </Field>
            <button className={primaryBtn} disabled={phone.replace(/\D/g, '').length < 9} onClick={() => { window.open(whatsappTrackingUrl(ws.name, share.tracking_number, trackingUrl(share.id), phone), '_blank'); setShare(null); }}>
              <MessageCircle className="w-3.5 h-3.5" /> Open customer chat
            </button>
          </div>
        </Modal>
      )}
      {note && (
        <Modal title={`Update for ${note.job.tracking_number}`} onClose={() => setNote(null)}>
          <div className="space-y-3">
            <Field label="Update"><input className={inputCls} value={note.text} onChange={(e) => setNote({ ...note, text: e.target.value })} placeholder="e.g. Traffic jam, arriving in 20 minutes" /></Field>
            <button className={primaryBtn} onClick={() => void saveNote()}>Save update</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
