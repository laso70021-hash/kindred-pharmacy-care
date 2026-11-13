import { useMemo, useState } from 'react';
import { Tag, CircleDollarSign, ShoppingBag, PackageX, CalendarClock, CalendarX, Plus, Download, Search, ArrowUpDown, ImageIcon } from 'lucide-react';
import type { WsBatch, WsProduct } from '@/lib/pharmacy-types';
import { canvasKpis, canvasRows, type CanvasFilter, type CanvasRow } from '@/lib/product-canvas';
import { filterByRange, type DateRange } from '@/lib/date-range';
import { formatNumber } from '@/lib/utils';
import { cardCls, inputCls, primaryBtn } from './ws-ui';

type SortKey = 'name' | 'quantity' | 'unit' | 'cost' | 'sell' | 'markup' | 'margin' | 'batch';
const pct = (n: number) => `${n.toFixed(2)}%`;

export function ProductsCanvas({ products, batches, onAdd, onEdit, editable }: { products: WsProduct[]; batches: WsBatch[]; onAdd: () => void; onEdit: (p: WsProduct) => void; editable: boolean }) {
  const [filter, setFilter] = useState<CanvasFilter>('instock');
  const [q, setQ] = useState('');
  const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const [sort, setSort] = useState<{ k: SortKey; asc: boolean }>({ k: 'name', asc: true });
  const [size, setSize] = useState(10); const [page, setPage] = useState(1);
  const k = canvasKpis(products, batches);

  const rows = useMemo(() => {
    let r = canvasRows(products, batches, filter).filter((x) => `${x.product.name} ${x.product.generic_name} ${x.product.sku} ${x.batch?.batch_number ?? ''}`.toLowerCase().includes(q.toLowerCase()));
    if (from || to) {
      const range: DateRange = { from: from || '1900-01-01', to: to || '2999-12-31' } as DateRange;
      r = filterByRange(r, (x: CanvasRow) => x.batch?.received_date || x.batch?.created_at || x.product.created_at, range);
    }
    const val = (x: CanvasRow): string | number => ({ name: x.product.name, quantity: x.quantity, unit: x.product.dosage_form, cost: x.cost, sell: x.sell, markup: x.markup, margin: x.margin, batch: x.batch?.batch_number ?? '' })[sort.k];
    return [...r].sort((a, b) => { const A = val(a), B = val(b); const c = typeof A === 'number' ? A - (B as number) : String(A).localeCompare(String(B)); return sort.asc ? c : -c; });
  }, [products, batches, filter, q, from, to, sort]);

  const pages = Math.max(1, Math.ceil(rows.length / size));
  const cur = Math.min(page, pages);
  const shown = rows.slice((cur - 1) * size, cur * size);
  const setF = (f: CanvasFilter) => { setFilter(f); setPage(1); };
  const th = (label: string, key: SortKey) => (
    <th className="py-3 px-3 font-bold text-slate-900 whitespace-nowrap"><button onClick={() => setSort((s) => ({ k: key, asc: s.k === key ? !s.asc : true }))} className="inline-flex items-center gap-1">{label}<ArrowUpDown className="w-3 h-3 text-slate-400" /></button></th>);

  const download = () => {
    const head = ['S/N', 'Product', 'Generic', 'Quantity', 'Selling Unit', 'Buying Price (TZS)', 'Selling Price (TZS)', 'Cost Markup %', 'Profit Margin %', 'Batch No'];
    const body = rows.map((r, i) => [i + 1, r.product.name, r.product.generic_name, r.quantity, r.product.dosage_form, r.cost, r.sell, r.markup.toFixed(2), r.margin.toFixed(2), r.batch?.batch_number ?? '']);
    const csv = [head, ...body].map((l) => l.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'pharmacy-products.csv'; a.click(); URL.revokeObjectURL(a.href);
  };

  const card = (label: string, value: string, sub: string, Icon: typeof Tag, tone: string, f?: CanvasFilter) => (
    <button type="button" onClick={() => f && setF(f)} className={`${cardCls} p-4 text-left ${f ? 'hover:border-blue-300' : 'cursor-default'} ${f && filter === f ? 'ring-2 ring-blue-500/30 border-blue-300' : ''}`}>
      <div className="flex items-start gap-3"><div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${tone}`}><Icon className="w-5 h-5" /></div><span className="text-sm font-semibold text-slate-700 leading-snug">{label}</span></div>
      <div className="mt-3 text-xl font-black text-slate-900 tracking-tight">{value}</div>
      <div className="text-[11px] text-slate-500 mt-1">{sub}</div>
    </button>);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">From:<input type="date" className={`${inputCls.replace('w-full ', '')} w-40`} value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} /></label>
        <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">To:<input type="date" className={`${inputCls.replace('w-full ', '')} w-40`} value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} /></label>
        {editable && <button className={primaryBtn} onClick={onAdd}><Plus className="w-3.5 h-3.5" /> Add New</button>}
        <button className={primaryBtn} onClick={download} disabled={!rows.length}><Download className="w-3.5 h-3.5" /> Download</button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {card('Total Stock Value (Selling)', `TZS ${formatNumber(k.sellingValue)}`, 'All Products', Tag, 'bg-purple-50 text-purple-600')}
        {card('Total Stock Value (Buying)', `TZS ${formatNumber(k.buyingValue)}`, 'All Products', CircleDollarSign, 'bg-emerald-50 text-emerald-600')}
        {card('Total InStock Products', formatNumber(k.inStock), 'All Products', ShoppingBag, 'bg-blue-50 text-blue-600', 'instock')}
        {card('Out Of Stock', formatNumber(k.outOfStock), 'Current', PackageX, 'bg-amber-50 text-amber-600', 'out')}
        {card('Expiring Soon', formatNumber(k.expiringSoon), 'Next 90 days', CalendarClock, 'bg-rose-50 text-rose-600', 'expiring')}
        {card('Expired Products', formatNumber(k.expired), 'Expired', CalendarX, 'bg-slate-100 text-slate-600', 'expired')}
      </div>
      <div className={`${cardCls} overflow-hidden`}>
        <div className="p-4 flex flex-wrap items-end justify-between gap-3">
          <select aria-label="Stock filter" className={`${inputCls.replace('w-full ', '')} w-56`} value={filter} onChange={(e) => setF(e.target.value as CanvasFilter)}>
            <option value="instock">InStock batches</option><option value="all">All products</option><option value="out">Out of stock</option><option value="expiring">Expiring soon (90 days)</option><option value="expired">Expired batches</option>
          </select>
          <label className="block w-full sm:w-72"><span className="text-xs font-semibold text-slate-700">Search products</span>
            <div className="relative mt-1"><input className={`${inputCls} pr-8`} placeholder="Search products..." value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /><Search className="w-4 h-4 absolute right-2.5 top-2.5 text-slate-400" /></div></label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs min-w-[960px]">
            <thead className="bg-slate-50 border-y border-slate-200"><tr><th className="py-3 px-3 font-bold text-slate-900">S/N</th><th />{th('Product Details', 'name')}{th('Quantity', 'quantity')}{th('Selling Unit', 'unit')}{th('Buying Price (TZS)', 'cost')}{th('Selling Price (TZS)', 'sell')}{th('Cost Markup', 'markup')}{th('Profit Margin', 'margin')}{th('Batch No', 'batch')}</tr></thead>
            <tbody className="divide-y divide-slate-100">
              {shown.length === 0 ? <tr><td colSpan={10} className="py-10 text-center text-slate-400 font-semibold">No products match these filters.</td></tr> : shown.map((r, i) => (
                <tr key={r.key} className="hover:bg-slate-50/60">
                  <td className="py-3 px-3 text-slate-600">{(cur - 1) * size + i + 1}</td>
                  <td className="px-2"><div className="w-12 h-10 rounded-lg bg-slate-100 overflow-hidden flex items-center justify-center">{r.product.image_src ? <img src={r.product.image_src} alt={r.product.name} className="w-full h-full object-cover" loading="lazy" /> : <ImageIcon className="w-4 h-4 text-slate-300" />}</div></td>
                  <td className="px-3 py-3"><button disabled={!editable} onClick={() => onEdit(r.product)} className="text-left"><div className="font-bold text-slate-800 uppercase">{r.product.name}</div><div className="text-slate-500">{[r.product.generic_name, r.product.strength].filter(Boolean).join(' ') || 'Medicine'}</div></button></td>
                  <td className="px-3">{formatNumber(r.quantity)}</td><td className="px-3">{r.product.dosage_form || '—'}</td>
                  <td className="px-3">TZS {formatNumber(r.cost)}</td><td className="px-3">TZS {formatNumber(r.sell)}</td>
                  <td className={`px-3 font-semibold ${r.markup >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{pct(r.markup)}</td>
                  <td className={`px-3 font-semibold ${r.margin >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{pct(r.margin)}</td>
                  <td className="px-3 text-slate-600">{r.batch?.batch_number ?? '—'}</td>
                </tr>))}
            </tbody>
          </table>
        </div>
        <div className="p-4 flex flex-wrap items-center justify-between gap-3 text-xs border-t border-slate-200">
          <span className="text-slate-600">Showing {rows.length ? (cur - 1) * size + 1 : 0} to {Math.min(cur * size, rows.length)} of {rows.length} results</span>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5">Rows per page:<select className={`${inputCls.replace('w-full ', '')} w-20`} value={size} onChange={(e) => { setSize(Number(e.target.value)); setPage(1); }}>{[10, 25, 50, 100].map((n) => <option key={n}>{n}</option>)}</select></label>
            <label className="flex items-center gap-1.5">Go to page:<input type="number" min={1} max={pages} className={`${inputCls.replace('w-full ', '')} w-16`} value={cur} onChange={(e) => setPage(Math.min(pages, Math.max(1, Number(e.target.value) || 1)))} /> / {pages}</label>
            <div className="flex rounded-lg border border-slate-200 overflow-hidden">
              <button className="px-3 py-1.5 disabled:text-slate-300" disabled={cur <= 1} onClick={() => setPage(cur - 1)}>Previous</button>
              {Array.from({ length: Math.min(5, pages) }, (_, i) => Math.min(Math.max(1, cur - 2), Math.max(1, pages - 4)) + i).map((n) => <button key={n} onClick={() => setPage(n)} className={`px-3 py-1.5 border-l border-slate-200 ${n === cur ? 'bg-blue-600 text-white' : ''}`}>{n}</button>)}
              <button className="px-3 py-1.5 border-l border-slate-200 disabled:text-slate-300" disabled={cur >= pages} onClick={() => setPage(cur + 1)}>Next</button>
            </div>
          </div>
        </div>
      </div>
    </div>);
}
