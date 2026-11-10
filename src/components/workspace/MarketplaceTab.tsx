import { useMemo, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Search, ShoppingCart, Plus, Minus, Package, Truck, Upload } from 'lucide-react';
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
  const { data: branches = [] } = useQuery({ queryKey: ['ws', ws.id, 'branches'], queryFn: () => WorkspaceService.getBranches(ws.id) });
  const [q, setQ] = useState('');
  const [supplier, setSupplier] = useState('all');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [checkout, setCheckout] = useState(false);
  const readOnly = isReadOnly(ws.status, ws.role);

  const suppliers = useMemo(() => [...new Map(catalog.map((c) => [c.supplier_id, c.supplier_name])).entries()], [catalog]);
  const shown = catalog.filter((c) => (supplier === 'all' || c.supplier_id === supplier)
    && `${c.name} ${c.generic_name} ${c.supplier_name}`.toLowerCase().includes(q.toLowerCase()));
  const byId = new Map(catalog.map((c) => [c.product_id, c]));

  const add = (c: CatalogItem, n = 1) => {
    if (cart.length && cart[0]!.supplier_id !== c.supplier_id && n > 0) toast.info(`New order started with ${c.supplier_name} — one supplier per order.`);
    setCart((prev) => addToCart(prev, { product_id: c.product_id, supplier_id: c.supplier_id, unit_price: c.unit_price, stock: c.stock }, n));
  };

  return (
    <div className="space-y-5">
      <SectionHeader title="Restock from suppliers" subtitle="Order wholesale, attach your payment proof — stock lands in your branch once the supplier confirms." />
      <div className="grid lg:grid-cols-[1fr_320px] gap-5 items-start">
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1"><Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input className={`${inputCls} pl-9`} placeholder="Search medicines or suppliers" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            <select aria-label="Supplier" className={`${inputCls} sm:w-56`} value={supplier} onChange={(e) => setSupplier(e.target.value)}>
              <option value="all">All suppliers</option>
              {suppliers.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
            </select>
          </div>
          {isLoading ? <Empty>Loading supplier catalogs…</Empty> : shown.length === 0 ? (
            <Empty>No supplier products yet. Approved suppliers' stock will appear here.</Empty>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
              {shown.map((c) => {
                const inCart = cart.find((l) => l.product_id === c.product_id)?.quantity ?? 0;
                return (
                  <div key={c.product_id} className={`${cardCls} overflow-hidden flex flex-col`}>
                    <div className="aspect-[4/3] bg-slate-100 flex items-center justify-center">
                      {c.image_src ? <img src={c.image_src} alt={c.name} className="w-full h-full object-cover" loading="lazy" /> : <Package className="w-8 h-8 text-slate-300" />}
                    </div>
                    <div className="p-3 flex-1 flex flex-col gap-1">
                      <div className="font-bold text-sm text-slate-900 leading-tight">{c.name} {c.strength}</div>
                      <div className="text-[11px] text-slate-500 flex items-center gap-1"><Truck className="w-3 h-3" />{c.supplier_name}</div>
                      <div className="text-sm font-black text-blue-600">TZS {formatNumber(c.unit_price)}</div>
                      <div className={`text-[11px] font-bold ${c.stock > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{c.stock > 0 ? `${c.stock} in stock` : 'Out of stock'}</div>
                      <div className="mt-auto pt-2">
                        {inCart > 0 ? (
                          <div className="flex items-center justify-between bg-blue-50 rounded-lg p-1">
                            <button aria-label="Less" className="p-1" onClick={() => add(c, -1)}><Minus className="w-3.5 h-3.5" /></button>
                            <span className="text-xs font-black">{inCart}</span>
                            <button aria-label="More" className="p-1" onClick={() => add(c, 1)}><Plus className="w-3.5 h-3.5" /></button>
                          </div>
                        ) : (
                          <button disabled={c.stock <= 0 || readOnly} className={`${primaryBtn} w-full justify-center`} onClick={() => add(c)}><Plus className="w-3.5 h-3.5" /> Add</button>
                        )}
                      </div>
                    </div>
                  </div>);
              })}
            </div>)}
        </div>

        <div className={`${cardCls} p-4 space-y-3 lg:sticky lg:top-4`}>
          <div className="font-black text-sm flex items-center gap-2"><ShoppingCart className="w-4 h-4" /> Order</div>
          {cart.length === 0 ? <p className="text-xs text-slate-400">Add products from one supplier.</p> : (
            <>
              <div className="text-[11px] font-bold text-slate-500">{byId.get(cart[0]!.product_id)?.supplier_name}</div>
              <ul className="space-y-2">
                {cart.map((l) => { const c = byId.get(l.product_id); return (
                  <li key={l.product_id} className="flex justify-between text-xs"><span>{l.quantity} × {c?.name}</span><span className="font-bold">{formatNumber(l.unit_price * l.quantity)}</span></li>); })}
              </ul>
              <div className="flex justify-between border-t pt-2 text-sm font-black"><span>Total</span><span>TZS {formatNumber(cartTotal(cart))}</span></div>
              <button className={`${primaryBtn} w-full justify-center`} disabled={readOnly} onClick={() => setCheckout(true)}>Pay & submit proof</button>
              <button className={`${ghostBtn} w-full justify-center`} onClick={() => setCart([])}>Clear</button>
            </>)}
        </div>
      </div>

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

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!branch) return toast.error('Add a branch first to receive stock.');
    if (!reference.trim() && !file) return toast.error('Add the transaction reference or attach the receipt.');
    setBusy(true);
    try {
      await WholesaleService.placeOrder({ userId, buyerId: ws.id, supplierId: cart[0]!.supplier_id, branchId: branch,
        items: cart.map((l) => ({ product_id: l.product_id, quantity: l.quantity })), method, reference, file });
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
