import { useMemo, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Search, ShoppingCart, Plus, Minus, Package, Truck, Upload, Trash2, ArrowLeft, Phone, Mail, MapPin, MessageCircle } from 'lucide-react';
import { WholesaleChat, OnlineBadge, usePartnerOnline } from './WholesaleChat';
import { useAuth } from '@/hooks/useAuth';
import type { Workspace } from '@/lib/pharmacy-types';
import { WholesaleService, WorkspaceService, type CatalogItem } from '@/lib/pharmacy-service';
import { addToCart, cartTotal, isReadOnly, type CartLine } from '@/lib/workspace';
import { formatNumber } from '@/lib/utils';
import { Modal, Field, Empty, SectionHeader, inputCls, primaryBtn, ghostBtn, cardCls, errorText } from './ws-ui';

const METHODS = [
  { v: 'mpesa', l: 'M-Pesa' }, { v: 'tigopesa', l: 'Tigo Pesa' }, { v: 'airtel', l: 'Airtel Money' }, { v: 'bank', l: 'Bank transfer' },
];

export function MarketplaceTab({ ws, userId, onOrdered }: { ws: Workspace; userId: string; onOrdered: () => void }) {
  const qc = useQueryClient();
  const { data: catalog = [], isLoading } = useQuery({ queryKey: ['wholesale', 'catalog'], queryFn: () => WholesaleService.catalog() });
  const { data: directory = [] } = useQuery({ queryKey: ['wholesale', 'suppliers'], queryFn: () => WholesaleService.suppliers() });
  const { data: branches = [] } = useQuery({ queryKey: ['ws', ws.id, 'branches'], queryFn: () => WorkspaceService.getBranches(ws.id) });
  const [q, setQ] = useState('');
  const [supplier, setSupplier] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [checkout, setCheckout] = useState(false);
  const [chat, setChat] = useState(false);
  const readOnly = isReadOnly(ws.status, ws.role);

  const suppliers = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of catalog) counts.set(c.supplier_id, (counts.get(c.supplier_id) || 0) + 1);
    const ids = new Set([...directory.map((d) => d.id), ...counts.keys()]);
    return [...ids].map((id) => {
      const d = directory.find((x) => x.id === id);
      const any = catalog.find((c) => c.supplier_id === id);
      return { id, name: d?.name || any?.supplier_name || 'Supplier', city: d?.city || any?.supplier_city || '', phone: d?.phone || '', email: d?.email || '', address: d?.address || '', count: counts.get(id) || 0 };
    }).filter((s) => s.name.toLowerCase().includes(supplier ? '' : q.toLowerCase()));
  }, [catalog, directory, q, supplier]);
  const current = suppliers.find((s) => s.id === supplier) || null;
  const online = usePartnerOnline(ws.id, supplier, 'buyer', Boolean(supplier));
  const shown = catalog.filter((c) => c.supplier_id === supplier
    && `${c.name} ${c.generic_name} ${c.dosage_form}`.toLowerCase().includes(q.toLowerCase()));
  const byId = new Map(catalog.map((c) => [c.product_id, c]));
  const items = cart.reduce((a, l) => a + l.quantity, 0);

  const add = (c: CatalogItem, n = 1) => {
    if (cart.length && cart[0]!.supplier_id !== c.supplier_id && n > 0) toast.info(`New bucket started with ${c.supplier_name} — one supplier per order.`);
    const cur = cart.find((l) => l.product_id === c.product_id)?.quantity ?? 0;
    if (n > 0 && cur + n > c.stock) toast.error(`Only ${c.stock} of ${c.name} available`);
    setCart((prev) => addToCart(prev, { product_id: c.product_id, supplier_id: c.supplier_id, unit_price: c.unit_price, stock: c.stock }, n));
  };
  const setQty = (c: CatalogItem, v: number) => {
    const cur = cart.find((l) => l.product_id === c.product_id)?.quantity ?? 0;
    add(c, Math.max(0, Math.min(c.stock, Math.floor(v || 0))) - cur);
  };
  const pick = (id: string) => { setSupplier(id); setQ(''); };

  return (
    <div className="space-y-5">
      <SectionHeader title="Restock from suppliers" subtitle="Order wholesale, attach your payment proof — stock lands in your branch once the supplier confirms." />

      {!current ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
            <span className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center">1</span> Choose a supplier
            <span className="text-slate-300">→</span><span className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center">2</span> Pick products
            <span className="text-slate-300">→</span><span className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center">3</span> Pay & send
          </div>
          <div className="relative"><Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input className={`${inputCls} pl-9`} placeholder="Search suppliers" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          {isLoading ? <Empty>Loading suppliers…</Empty> : suppliers.length === 0 ? <Empty>No approved suppliers yet.</Empty> : (
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {suppliers.map((s) => (
                <button key={s.id} onClick={() => pick(s.id)} className={`${cardCls} p-4 text-left hover:border-blue-400 transition-colors space-y-2`}>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center"><Truck className="w-5 h-5" /></div>
                    <div className="min-w-0"><div className="font-black text-sm truncate">{s.name}</div><div className="text-[11px] text-slate-500">{s.city || 'Tanzania'}</div></div>
                  </div>
                  {s.phone && <div className="text-[11px] text-slate-600 flex items-center gap-1"><Phone className="w-3 h-3" />{s.phone}</div>}
                  <div className="text-[11px] font-bold text-blue-600">{s.count} product{s.count === 1 ? '' : 's'} available →</div>
                </button>))}
            </div>)}
        </div>
      ) : (
        <>
          <div className={`${cardCls} p-4 flex flex-wrap items-center gap-3`}>
            <button className={ghostBtn} onClick={() => { setSupplier(''); setQ(''); }}><ArrowLeft className="w-3.5 h-3.5" /> Suppliers</button>
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center"><Truck className="w-5 h-5" /></div>
            <div className="flex-1 min-w-[180px]">
              <div className="font-black text-sm flex items-center gap-2">{current.name} <OnlineBadge online={online} /></div>
              <div className="text-[11px] text-slate-500 flex flex-wrap gap-x-3">
                {current.city && <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" />{current.address ? `${current.address}, ` : ''}{current.city}</span>}
                {current.phone && <a href={`tel:${current.phone}`} className="inline-flex items-center gap-1 hover:text-blue-600"><Phone className="w-3 h-3" />{current.phone}</a>}
                {current.email && <a href={`mailto:${current.email}`} className="inline-flex items-center gap-1 hover:text-blue-600"><Mail className="w-3 h-3" />{current.email}</a>}
              </div>
            </div>
            <button className={primaryBtn} onClick={() => setChat(true)}><MessageCircle className="w-3.5 h-3.5" /> Chat</button>
          </div>

          <div className="grid lg:grid-cols-[1fr_340px] gap-4 items-start">
            <div className="space-y-3">
              <div className="relative"><Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input autoFocus className={`${inputCls} pl-9`} placeholder={`Search ${current.name}'s products`} value={q} onChange={(e) => setQ(e.target.value)} /></div>
              {shown.length === 0 ? <Empty>No products found for this supplier.</Empty> : (
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
                  {shown.map((c) => {
                    const inCart = cart.find((l) => l.product_id === c.product_id)?.quantity ?? 0;
                    return (
                      <div key={c.product_id} className={`${cardCls} overflow-hidden flex flex-col ${inCart ? 'border-blue-500 ring-1 ring-blue-500' : ''} ${c.stock <= 0 ? 'opacity-50' : ''}`}>
                        <button disabled={c.stock <= 0 || readOnly} onClick={() => add(c, 1)} className="aspect-[4/3] bg-slate-100 flex items-center justify-center w-full relative">
                          {c.image_src ? <img src={c.image_src} alt={c.name} className="w-full h-full object-cover" loading="lazy" /> : <Package className="w-8 h-8 text-slate-300" />}
                          {inCart > 0 && <span className="absolute top-2 right-2 bg-blue-600 text-white text-[11px] font-black rounded-full min-w-6 h-6 px-1.5 flex items-center justify-center">{inCart}</span>}
                        </button>
                        <div className="p-2.5 flex-1 flex flex-col gap-0.5">
                          <div className="font-bold text-sm leading-tight">{c.name} {c.strength}</div>
                          {c.dosage_form && <div className="text-[11px] text-slate-500">{c.dosage_form}</div>}
                          <div className="text-sm font-black text-blue-600">TZS {formatNumber(c.unit_price)}</div>
                          <div className={`text-[11px] font-bold ${c.stock > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{c.stock > 0 ? `${c.stock} available` : 'Out of stock'}{c.is_prescription_required ? ' · Rx' : ''}</div>
                          <div className="mt-auto pt-2">
                            {inCart > 0 ? (
                              <div className="flex items-center justify-between bg-blue-50 rounded-lg p-1">
                                <button aria-label="Less" className="p-1" onClick={() => add(c, -1)}><Minus className="w-3.5 h-3.5" /></button>
                                <input aria-label="Quantity" type="number" min={0} max={c.stock} value={inCart} onChange={(e) => setQty(c, Number(e.target.value))} className="w-14 text-center text-xs font-black bg-transparent" />
                                <button aria-label="More" className="p-1" onClick={() => add(c, 1)}><Plus className="w-3.5 h-3.5" /></button>
                              </div>
                            ) : (
                              <button disabled={c.stock <= 0 || readOnly} className={`${primaryBtn} w-full justify-center`} onClick={() => add(c)}><Plus className="w-3.5 h-3.5" /> Add to bucket</button>
                            )}
                          </div>
                        </div>
                      </div>);
                  })}
                </div>)}
            </div>

            <div className={`${cardCls} p-4 space-y-3 lg:sticky lg:top-4`}>
              <div className="font-black text-sm flex items-center gap-2"><ShoppingCart className="w-4 h-4" /> Bucket {items > 0 && <span className="text-[11px] text-slate-500">({items} items)</span>}</div>
              {cart.length === 0 ? <p className="text-xs text-slate-400">Tap products to add them to your bucket.</p> : (
                <>
                  <div className="text-[11px] font-bold text-slate-500">{byId.get(cart[0]!.product_id)?.supplier_name}</div>
                  <ul className="space-y-2">{cart.map((l) => { const c = byId.get(l.product_id); if (!c) return null; return (
                    <li key={l.product_id} className="flex items-center gap-2 text-xs">
                      <div className="w-9 h-9 rounded-lg bg-slate-100 overflow-hidden shrink-0 flex items-center justify-center">{c.image_src ? <img src={c.image_src} alt="" className="w-full h-full object-cover" /> : <Package className="w-4 h-4 text-slate-300" />}</div>
                      <span className="flex-1 font-semibold leading-tight">{c.name}<div className="text-[10px] text-slate-400">@ {formatNumber(l.unit_price)}</div></span>
                      <button aria-label="Less" onClick={() => add(c, -1)}><Minus className="w-3.5 h-3.5" /></button>
                      <span className="w-7 text-center font-black">{l.quantity}</span>
                      <button aria-label="More" onClick={() => add(c, 1)}><Plus className="w-3.5 h-3.5" /></button>
                      <span className="w-16 text-right font-bold">{formatNumber(l.unit_price * l.quantity)}</span>
                      <button aria-label="Remove" onClick={() => add(c, -l.quantity)}><Trash2 className="w-3.5 h-3.5 text-slate-400" /></button>
                    </li>); })}</ul>
                  <div className="flex justify-between border-t pt-2 text-base font-black"><span>Total</span><span>TZS {formatNumber(cartTotal(cart))}</span></div>
                  <button className={`${primaryBtn} w-full justify-center`} disabled={readOnly} onClick={() => setCheckout(true)}>Continue — delivery & payment</button>
                  <button className={`${ghostBtn} w-full justify-center`} onClick={() => setCart([])}>Empty bucket</button>
                </>)}
            </div>
          </div>
        </>
      )}

      {chat && current && <WholesaleChat buyerId={ws.id} supplierId={current.id} side="buyer" myName={ws.name} partnerName={current.name} onClose={() => setChat(false)} />}
      {checkout && cart.length > 0 && (
        <CheckoutModal ws={ws} userId={userId} cart={cart} supplierName={byId.get(cart[0]!.product_id)?.supplier_name || ''}
          branches={branches.filter((b) => b.is_active)} onClose={() => setCheckout(false)}
          onDone={() => { setCart([]); setCheckout(false); void qc.invalidateQueries({ queryKey: ['wholesale'] }); onOrdered(); }} />)}
    </div>
  );
}

function CheckoutModal({ ws, userId, cart, supplierName, branches, onClose, onDone }: {
  ws: Workspace; userId: string; cart: CartLine[]; supplierName: string; branches: { id: string; name: string; is_main: boolean }[]; onClose: () => void; onDone: () => void;
}) {
  const [branch, setBranch] = useState(branches.find((b) => b.is_main)?.id || branches[0]?.id || '');
  const [method, setMethod] = useState('mpesa');
  const [reference, setReference] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const { user } = useAuth();
  const [contact, setContact] = useState({ name: (user?.user_metadata?.full_name as string) || ws.name, phone: '', address: '', note: '' });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!branch) { toast.error('Add a branch first to receive stock.'); return; }
    if (!contact.phone.trim() || !contact.address.trim()) { toast.error('Add a contact phone and delivery address.'); return; }
    if (!reference.trim() && !file) { toast.error('Add the transaction reference or attach the receipt.'); return; }
    setBusy(true);
    try {
      const orderId = await WholesaleService.placeOrder({ userId, buyerId: ws.id, supplierId: cart[0]!.supplier_id, branchId: branch,
        items: cart.map((l) => ({ product_id: l.product_id, quantity: l.quantity })), method, reference, file });
      await WholesaleService.setDelivery(orderId, contact);
      toast.success('Order sent. The supplier will confirm your payment.');
      onDone();
    } catch (err) { toast.error(errorText(err)); } finally { setBusy(false); }
  };

  return (
    <Modal title={`Pay ${supplierName}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div className="rounded-xl bg-blue-50 px-3 py-2 text-sm font-black text-blue-900">Amount: TZS {formatNumber(cartTotal(cart))}</div>
        <Field label="Deliver to branch">
          <select className={inputCls} value={branch} onChange={(e) => setBranch(e.target.value)} required>
            {branches.length === 0 && <option value="">No branches yet</option>}
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}{b.is_main ? ' (main)' : ''}</option>)}
          </select>
        </Field>
        <div className="rounded-xl border border-slate-200 p-3 space-y-2">
          <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">Buyer & delivery — {ws.name}</div>
          <div className="grid sm:grid-cols-2 gap-2">
            <Field label="Contact person"><input className={inputCls} value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} required /></Field>
            <Field label="Phone"><input className={inputCls} type="tel" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} placeholder="07xx xxx xxx" required /></Field>
          </div>
          <Field label="Delivery address"><input className={inputCls} value={contact.address} onChange={(e) => setContact({ ...contact, address: e.target.value })} placeholder="Street, area, city" required /></Field>
          <Field label="MedPoint / delivery note (optional)"><input className={inputCls} value={contact.note} onChange={(e) => setContact({ ...contact, note: e.target.value })} placeholder="e.g. MedPoint Kariakoo, call on arrival" /></Field>
        </div>
        <Field label="Payment method">
          <div className="grid grid-cols-2 gap-2">{METHODS.map((m) => (
            <button type="button" key={m.v} onClick={() => setMethod(m.v)} className={`px-3 py-2 rounded-xl border text-xs font-bold ${method === m.v ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200'}`}>{m.l}</button>))}</div>
        </Field>
        <Field label="Transaction reference"><input className={inputCls} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. QK72H1XY9" /></Field>
        <Field label="Receipt / screenshot" hint="Image or PDF, up to 10 MB. Add a reference, a receipt, or both.">
          <label className="flex items-center gap-2 px-3 py-3 rounded-xl border border-dashed border-slate-300 text-xs text-slate-600 cursor-pointer hover:bg-slate-50">
            <Upload className="w-4 h-4" /> {file ? file.name : 'Choose file'}
            <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
        </Field>
        <button className={`${primaryBtn} w-full justify-center`} disabled={busy}>{busy ? 'Sending…' : 'Submit order & payment proof'}</button>
      </form>
    </Modal>
  );
}
