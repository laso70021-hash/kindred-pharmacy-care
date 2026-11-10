import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, PackagePlus, Pill, Search } from 'lucide-react';
import { WorkspaceService } from '@/lib/pharmacy-service';
import type { Workspace, WsProduct } from '@/lib/pharmacy-types';
import { can, stockState, EXPIRY_WARNING_DAYS } from '@/lib/workspace';
import { formatNumber, formatDateDeterministic } from '@/lib/utils';
import { cardCls, Empty, Field, Modal, SectionHeader, errorText, ghostBtn, inputCls, primaryBtn } from './ws-ui';

export function InventoryTab({ ws, userId }: { ws: Workspace; userId: string }) {
  const pid = ws.id;
  const qc = useQueryClient();
  const editable = can(ws.role, 'manageStock', ws.status);
  const { data: products = [], isLoading } = useQuery({ queryKey: ['ws', pid, 'products'], queryFn: () => WorkspaceService.getProducts(pid) });
  const { data: batches = [] } = useQuery({ queryKey: ['ws', pid, 'batches'], queryFn: () => WorkspaceService.getBatches(pid) });
  const { data: branches = [] } = useQuery({ queryKey: ['ws', pid, 'branches'], queryFn: () => WorkspaceService.getBranches(pid) });
  const [view, setView] = useState<'grid' | 'batches'>('grid');
  const [q, setQ] = useState('');
  const [branch, setBranch] = useState('');
  const [editing, setEditing] = useState<Partial<WsProduct> | null>(null);
  const [receiving, setReceiving] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['ws', pid, 'products'] });
    void qc.invalidateQueries({ queryKey: ['ws', pid, 'batches'] });
  };
  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true);
    try { await fn(); toast.success(ok); refresh(); } catch (err) { toast.error(errorText(err)); } finally { setBusy(false); }
  };
  const qty = (p: WsProduct) => (branch ? p.stock_by_branch[branch] || 0 : p.stock);
  const shown = products.filter((p) => `${p.name} ${p.generic_name} ${p.sku}`.toLowerCase().includes(q.toLowerCase()));
  const branchName = (id: string | null) => branches.find((b) => b.id === id)?.name ?? '—';

  return (
    <div className="space-y-5">
      <SectionHeader title="Inventory" subtitle={`${products.length} products · stock per branch`} action={editable && (
        <div className="flex gap-2">
          <button className={ghostBtn} disabled={!products.length || !branches.length} onClick={() => setReceiving('')}><PackagePlus className="w-3.5 h-3.5" /> Receive stock</button>
          <button className={primaryBtn} onClick={() => setEditing({})}><Plus className="w-3.5 h-3.5" /> Add product</button>
        </div>)} />
      {editable && branches.length === 0 && <div className="text-xs bg-amber-50 border border-amber-200 text-amber-900 rounded-xl px-4 py-2.5 font-semibold">Add a branch first so you can receive stock into it.</div>}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative"><Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" /><input className={`${inputCls.replace('w-full ', '')} pl-8 w-56`} placeholder="Search products" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <select className={`${inputCls.replace('w-full ', '')} w-44`} value={branch} onChange={(e) => setBranch(e.target.value)} aria-label="Branch">
          <option value="">All branches</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <div className="flex bg-slate-100 rounded-lg p-0.5 text-xs font-bold">
          {(['grid', 'batches'] as const).map((v) => <button key={v} onClick={() => setView(v)} className={`px-3 py-1.5 rounded-md ${view === v ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500'}`}>{v === 'grid' ? 'Products' : 'Batches'}</button>)}
        </div>
      </div>

      {isLoading ? <Empty>Loading…</Empty> : view === 'grid' ? (
        shown.length === 0 ? <Empty>No products yet.</Empty> : (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
            {shown.map((p) => {
              const st = stockState(qty(p), p.min_stock_level);
              return (
                <div key={p.id} className={`${cardCls} overflow-hidden flex flex-col ${p.is_active ? '' : 'opacity-50'}`}>
                  <div className="aspect-square bg-slate-50 flex items-center justify-center">
                    {p.image_src ? <img src={p.image_src} alt={p.name} className="w-full h-full object-cover" loading="lazy" /> : <Pill className="w-10 h-10 text-slate-300" />}
                  </div>
                  <div className="p-3 space-y-1.5 flex-1 flex flex-col">
                    <div className="font-black text-slate-900 text-sm leading-tight">{p.name}</div>
                    <div className="text-[11px] text-slate-400">{[p.strength, p.dosage_form].filter(Boolean).join(' ') || p.generic_name}</div>
                    <div className="text-sm font-black text-blue-600">TZS {formatNumber(p.selling_price)}</div>
                    <span className={`self-start text-[10px] font-bold px-2 py-0.5 rounded-md ${st === 'out' ? 'bg-rose-100 text-rose-700' : st === 'low' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-700'}`}>
                      {st === 'out' ? 'Out of stock' : `${qty(p)} in stock`}
                    </span>
                    {editable && <div className="flex gap-1.5 pt-1 mt-auto">
                      <button className={ghostBtn} onClick={() => setEditing(p)}>Edit</button>
                      <button className={ghostBtn} disabled={!branches.length} onClick={() => setReceiving(p.id)}>+ Stock</button>
                    </div>}
                  </div>
                </div>);
            })}
          </div>)
      ) : (
        <div className={`${cardCls} p-5 overflow-x-auto`}>
          {batches.length === 0 ? <Empty>No stock received yet.</Empty> : (
            <table className="w-full text-left text-xs min-w-[640px]">
              <thead><tr className="border-b border-slate-200 text-slate-400 uppercase text-[10px] font-bold"><th className="py-2">Product</th><th>Batch</th><th>Branch</th><th>Qty</th><th>Cost/unit</th><th>Expiry</th>{editable && <th />}</tr></thead>
              <tbody className="divide-y divide-slate-100">
                {batches.filter((b) => !branch || b.branch_id === branch).map((b) => (
                  <tr key={b.id}>
                    <td className="py-2.5 font-bold text-slate-900">{b.product_name}</td><td>{b.batch_number}</td><td>{branchName(b.branch_id)}</td>
                    <td className="font-bold">{b.quantity}</td><td>TZS {formatNumber(b.cost_per_unit)}</td>
                    <td className={b.days_to_expiry <= EXPIRY_WARNING_DAYS ? 'text-orange-600 font-bold' : ''}>{formatDateDeterministic(b.expiry_date)}</td>
                    {editable && <td className="text-right"><button className={ghostBtn} disabled={busy} onClick={() => {
                      const v = prompt(`New counted quantity for ${b.product_name} (${b.batch_number})`, String(b.quantity));
                      if (v === null || isNaN(Number(v)) || Number(v) < 0) return;
                      void run(() => WorkspaceService.adjustBatch(pid, userId, b, Number(v), 'Stock count'), 'Stock adjusted');
                    }}>Adjust</button></td>}
                  </tr>))}
              </tbody>
            </table>)}
        </div>
      )}

      {editing && <ProductForm initial={editing} busy={busy} onClose={() => setEditing(null)} onSave={(input, photo, active) => void run(async () => {
        await WorkspaceService.saveProduct(pid, input, photo);
        if (input.id && active !== undefined) await WorkspaceService.setProductActive(input.id, active);
        setEditing(null);
      }, 'Product saved')} />}
      {receiving !== null && <ReceiveForm products={products} branches={branches} initialProduct={receiving} busy={busy} onClose={() => setReceiving(null)} onSave={(input) => void run(async () => {
        await WorkspaceService.receiveStock(pid, userId, input);
        setReceiving(null);
      }, 'Stock received')} />}
    </div>
  );
}

function ProductForm({ initial, busy, onClose, onSave }: { initial: Partial<WsProduct>; busy: boolean; onClose: () => void; onSave: (i: any, photo: File | null, active?: boolean) => void }) {
  const [f, setF] = useState({
    name: initial.name ?? '', generic_name: initial.generic_name ?? '', sku: initial.sku ?? '', barcode: initial.barcode ?? '',
    dosage_form: initial.dosage_form ?? 'Tablets', strength: initial.strength ?? '', cost_price: String(initial.cost_price ?? ''),
    selling_price: String(initial.selling_price ?? ''), min_stock_level: String(initial.min_stock_level ?? 10), is_prescription_required: initial.is_prescription_required ?? false,
  });
  const [active, setActive] = useState(initial.is_active ?? true);
  const [photo, setPhoto] = useState<File | null>(null);
  const preview = photo ? URL.createObjectURL(photo) : initial.image_src ?? null;
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal title={initial.id ? 'Edit product' : 'Add product'} onClose={onClose} wide>
      <form className="grid grid-cols-1 sm:grid-cols-2 gap-3" onSubmit={(e) => {
        e.preventDefault();
        if (!f.name.trim() || !Number(f.selling_price)) return;
        onSave({ ...(initial.id ? { id: initial.id } : {}), ...f, name: f.name.trim(), cost_price: Number(f.cost_price) || 0, selling_price: Number(f.selling_price), min_stock_level: Number(f.min_stock_level) || 0 }, photo, initial.id ? active : undefined);
      }}>
        <div className="sm:col-span-2 flex items-center gap-3">
          <div className="w-20 h-20 rounded-xl bg-slate-50 border border-slate-200 overflow-hidden flex items-center justify-center">{preview ? <img src={preview} alt="" className="w-full h-full object-cover" /> : <Pill className="w-8 h-8 text-slate-300" />}</div>
          <Field label="Photo" hint="JPG/PNG up to 5 MB — shown on the cashier grid"><input type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} className="text-xs" /></Field>
        </div>
        <Field label="Name"><input className={inputCls} required value={f.name} onChange={set('name')} /></Field>
        <Field label="Generic name"><input className={inputCls} value={f.generic_name} onChange={set('generic_name')} /></Field>
        <Field label="Strength"><input className={inputCls} value={f.strength} onChange={set('strength')} placeholder="500mg" /></Field>
        <Field label="Form"><input className={inputCls} value={f.dosage_form} onChange={set('dosage_form')} /></Field>
        <Field label="SKU"><input className={inputCls} value={f.sku} onChange={set('sku')} /></Field>
        <Field label="Barcode"><input className={inputCls} value={f.barcode} onChange={set('barcode')} /></Field>
        <Field label="Cost price (TZS)"><input type="number" min={0} className={inputCls} value={f.cost_price} onChange={set('cost_price')} /></Field>
        <Field label="Selling price (TZS)"><input type="number" min={1} required className={inputCls} value={f.selling_price} onChange={set('selling_price')} /></Field>
        <Field label="Minimum stock"><input type="number" min={0} className={inputCls} value={f.min_stock_level} onChange={set('min_stock_level')} /></Field>
        <div className="flex flex-col gap-2 justify-end text-xs font-semibold text-slate-700">
          <label className="flex items-center gap-2"><input type="checkbox" checked={f.is_prescription_required} onChange={(e) => setF({ ...f, is_prescription_required: e.target.checked })} /> Prescription required</label>
          {initial.id && <label className="flex items-center gap-2"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Available for sale</label>}
        </div>
        <button type="submit" disabled={busy} className={`${primaryBtn} sm:col-span-2 justify-center py-2.5`}>{busy ? 'Saving…' : 'Save product'}</button>
      </form>
    </Modal>
  );
}

function ReceiveForm({ products, branches, initialProduct, busy, onClose, onSave }: { products: WsProduct[]; branches: { id: string; name: string; is_main: boolean }[]; initialProduct: string; busy: boolean; onClose: () => void; onSave: (i: { product_id: string; branch_id: string; batch_number: string; quantity: number; cost_per_unit: number; expiry_date: string }) => void }) {
  const [productId, setProductId] = useState(initialProduct || products[0]?.id || '');
  const [branchId, setBranchId] = useState(branches.find((b) => b.is_main)?.id ?? branches[0]?.id ?? '');
  const [batch, setBatch] = useState('');
  const [quantity, setQuantity] = useState('');
  const [cost, setCost] = useState(String(products.find((p) => p.id === productId)?.cost_price || ''));
  const [expiry, setExpiry] = useState('');
  return (
    <Modal title="Receive stock" onClose={onClose}>
      <form className="space-y-3" onSubmit={(e) => {
        e.preventDefault();
        if (!productId || !branchId || !Number(quantity) || !expiry) return;
        onSave({ product_id: productId, branch_id: branchId, batch_number: batch.trim() || `B-${Date.now().toString().slice(-6)}`, quantity: Number(quantity), cost_per_unit: Number(cost) || 0, expiry_date: expiry });
      }}>
        <Field label="Product"><select className={inputCls} value={productId} onChange={(e) => { setProductId(e.target.value); setCost(String(products.find((p) => p.id === e.target.value)?.cost_price || '')); }}>{products.map((p) => <option key={p.id} value={p.id}>{p.name} {p.strength}</option>)}</select></Field>
        <Field label="Into branch"><select className={inputCls} value={branchId} onChange={(e) => setBranchId(e.target.value)}>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
        <Field label="Batch number"><input className={inputCls} value={batch} onChange={(e) => setBatch(e.target.value)} placeholder="Auto if empty" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Quantity"><input type="number" min={1} required className={inputCls} value={quantity} onChange={(e) => setQuantity(e.target.value)} /></Field>
          <Field label="Cost / unit (TZS)"><input type="number" min={0} className={inputCls} value={cost} onChange={(e) => setCost(e.target.value)} /></Field>
        </div>
        <Field label="Expiry date"><input type="date" required className={inputCls} value={expiry} onChange={(e) => setExpiry(e.target.value)} /></Field>
        <button type="submit" disabled={busy} className={`${primaryBtn} w-full justify-center py-2.5`}>{busy ? 'Saving…' : 'Add to stock'}</button>
      </form>
    </Modal>
  );
}
