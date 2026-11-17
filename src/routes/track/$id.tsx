import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { BRAND } from '@/lib/brand';

type Tracking = { id: string; tracking_number: string; status: string; pickup_address: string | null; dropoff_address: string; dropoff_lat: number | null; dropoff_lng: number | null; rider_lat: number | null; rider_lng: number | null; rider_seen_at: string | null; created_at: string };

const STAGES = [['pending', 'Order received'], ['accepted', 'Rider assigned'], ['picked_up', 'Picked up'], ['in_transit', 'In transit'], ['arrived', 'Out for delivery'], ['delivered', 'Delivered']] as const;

export const Route = createFileRoute('/track/$id')({
  head: () => ({
    meta: [
      { title: 'Track Your Delivery | Swahivo' },
      { name: 'description', content: 'Follow your pharmacy delivery live, from pickup to your door.' },
      { property: 'og:title', content: 'Track Your Delivery | Swahivo' },
      { property: 'og:description', content: 'Follow your pharmacy delivery live, from pickup to your door.' },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary' },
    ],
  }),
  component: TrackPage,
});

function TrackPage() {
  const { id } = Route.useParams();
  const { data, isLoading } = useQuery({
    queryKey: ['public-track', id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_public_delivery_tracking', { _job: id });
      if (error) throw error;
      return data as unknown as Tracking | null;
    },
    refetchInterval: 15000,
  });
  const idx = data ? STAGES.findIndex(([s]) => s === data.status) : -1;
  return (
    <div className="min-h-screen bg-slate-50 flex items-start justify-center p-4 sm:p-10">
      <div className="w-full max-w-lg bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
        <div className="flex items-center gap-3">
          <img src={BRAND.markUrl} alt="Swahivo" className="w-9 h-9 rounded-full" />
          <div><div className="font-extrabold text-slate-900">Swahivo</div><div className="text-xs text-blue-600 font-bold">Delivery tracking</div></div>
        </div>
        {isLoading ? <p className="text-sm text-slate-500">Loading your delivery…</p> : !data ? <p className="text-sm text-slate-500">We couldn't find this delivery. Check the link you received.</p> : (
          <>
            <div>
              <div className="text-[11px] uppercase font-bold text-slate-400">Tracking number</div>
              <div className="text-2xl font-black text-slate-900 tracking-wide">{data.tracking_number}</div>
              <div className="mt-1 text-sm font-semibold text-blue-700">{data.status === 'cancelled' ? 'Cancelled' : STAGES[idx]?.[1] ?? data.status}</div>
            </div>
            {data.status !== 'cancelled' && (
              <ol className="space-y-2">
                {STAGES.map(([s, label], i) => (
                  <li key={s} className="flex items-center gap-3 text-sm">
                    <span className={`w-3 h-3 rounded-full ${i <= idx ? 'bg-blue-600' : 'bg-slate-200'}`} />
                    <span className={i <= idx ? 'font-bold text-slate-900' : 'text-slate-400'}>{label}</span>
                  </li>
                ))}
              </ol>
            )}
            <div className="text-sm space-y-1 border-t border-slate-100 pt-4">
              {data.pickup_address && <div><span className="text-slate-400">From:</span> {data.pickup_address}</div>}
              <div><span className="text-slate-400">To:</span> {data.dropoff_address}</div>
              {data.rider_seen_at && <div className="text-xs text-slate-500">Rider last seen {new Date(data.rider_seen_at).toLocaleString()}</div>}
              {data.rider_lat != null && data.rider_lng != null && (
                <a className="text-blue-600 font-semibold text-xs" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${data.rider_lat},${data.rider_lng}`}>See rider on map</a>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
