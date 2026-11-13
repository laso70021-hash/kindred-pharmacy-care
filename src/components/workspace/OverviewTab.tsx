import { useQuery } from '@tanstack/react-query';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { ShoppingCart, TrendingUp, Wallet, PiggyBank, Boxes, AlertTriangle, CalendarClock, GitBranch, Users2 } from 'lucide-react';
import { WorkspaceService } from '@/lib/pharmacy-service';
import type { Workspace } from '@/lib/pharmacy-types';
import { filterByRange, recordDayKey, formatDayKey, type DateRange } from '@/lib/date-range';
import { can, limitLabel, profitSummary, stockState, EXPIRY_WARNING_DAYS } from '@/lib/workspace';
import { formatNumber, formatDateDeterministic } from '@/lib/utils';
import { cardCls, Empty } from './ws-ui';
import { OverviewAnalytics } from './OverviewAnalytics';

function Kpi({ label, value, sub, Icon, tone }: { label: string; value: string; sub: string; Icon: typeof ShoppingCart; tone: string }) {
  return (
    <div className={`${cardCls} p-4`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-slate-500">{label}</span>
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${tone}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <div className="text-lg font-black text-slate-900 tracking-tight">{value}</div>
      <div className="text-[11px] text-slate-400 font-medium mt-1">{sub}</div>
    </div>
  );
}

export function OverviewTab({ ws, range, isMounted }: { ws: Workspace; range: DateRange | null; isMounted: boolean }) {
  const pid = ws.id;
  const showFinance = can(ws.role, 'viewFinance', ws.status);
  const { data: allSales = [] } = useQuery({ queryKey: ['ws', pid, 'sales'], queryFn: () => WorkspaceService.getSales(pid) });
  const { data: allExpenses = [] } = useQuery({ queryKey: ['ws', pid, 'expenses'], queryFn: () => WorkspaceService.getExpenses(pid) });
  const { data: products = [] } = useQuery({ queryKey: ['ws', pid, 'products'], queryFn: () => WorkspaceService.getProducts(pid) });
  const { data: batches = [] } = useQuery({ queryKey: ['ws', pid, 'batches'], queryFn: () => WorkspaceService.getBatches(pid) });
  const { data: branches = [] } = useQuery({ queryKey: ['ws', pid, 'branches'], queryFn: () => WorkspaceService.getBranches(pid) });
  const canSeeStaff = can(ws.role, 'manageBranches', 'active');
  const { data: staff = [] } = useQuery({
    queryKey: ['ws', pid, 'staff'],
    queryFn: () => WorkspaceService.getStaff(pid),
    enabled: canSeeStaff,
  });
  const { data: invites = [] } = useQuery({
    queryKey: ['ws', pid, 'invites'],
    queryFn: () => WorkspaceService.getInvites(pid),
    enabled: canSeeStaff,
  });

  const sales = filterByRange(allSales, (s) => s.created_at, range);
  const expenses = filterByRange(allExpenses, (e) => e.expense_date, range);
  const profit = profitSummary(sales, expenses.map((e) => e.amount));

  const inStock = batches.filter((b) => b.quantity > 0);
  const stockCost = inStock.reduce((a, b) => a + b.quantity * b.cost_per_unit, 0);
  const priceById = new Map(products.map((p) => [p.id, p.selling_price]));
  const stockRetail = inStock.reduce((a, b) => a + b.quantity * (priceById.get(b.product_id) || 0), 0);
  const lowStock = products.filter((p) => p.is_active && stockState(p.stock, p.min_stock_level) !== 'ok');
  const expiring = inStock.filter((b) => b.days_to_expiry <= EXPIRY_WARNING_DAYS);

  const byDay = new Map<string, { date: string; sales: number }>();
  for (const s of sales) {
    const key = recordDayKey(s.created_at);
    if (!key) continue;
    const p = byDay.get(key) ?? { date: formatDayKey(key).slice(0, 6), sales: 0 };
    p.sales += s.total;
    byDay.set(key, p);
  }
  const chart = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, p]) => p);

  const branchName = (id: string | null) => branches.find((b) => b.id === id)?.name ?? 'No branch';

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Sales" value={`TZS ${formatNumber(profit.revenue)}`} sub={`${sales.length} sale(s) in period`} Icon={ShoppingCart} tone="bg-emerald-50 text-emerald-600" />
        {showFinance ? (
          <>
            <Kpi label="Gross profit" value={`TZS ${formatNumber(profit.grossProfit)}`} sub={`Cost of goods TZS ${formatNumber(profit.costOfGoods)}`} Icon={TrendingUp} tone="bg-blue-50 text-blue-600" />
            <Kpi label="Expenses" value={`TZS ${formatNumber(profit.expenses)}`} sub={`${expenses.length} record(s) in period`} Icon={Wallet} tone="bg-rose-50 text-rose-600" />
            <Kpi
              label="Net profit"
              value={`TZS ${formatNumber(profit.netProfit)}`}
              sub={`${profit.marginPct}% of sales`}
              Icon={PiggyBank}
              tone={profit.netProfit >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}
            />
          </>
        ) : (
          <Kpi label="Products" value={String(products.length)} sub="In your catalogue" Icon={Boxes} tone="bg-blue-50 text-blue-600" />
        )}
        <Kpi label="Stock value (cost)" value={`TZS ${formatNumber(stockCost)}`} sub={`Sells for TZS ${formatNumber(stockRetail)}`} Icon={Boxes} tone="bg-indigo-50 text-indigo-600" />
        <Kpi label="Low / out of stock" value={String(lowStock.length)} sub="Products at or below minimum" Icon={AlertTriangle} tone="bg-amber-50 text-amber-600" />
        <Kpi label="Expiring soon" value={String(expiring.length)} sub={`Batches within ${EXPIRY_WARNING_DAYS} days`} Icon={CalendarClock} tone="bg-orange-50 text-orange-600" />
        <Kpi
          label="Plan usage"
          value={`${limitLabel(branches.length, ws.limits.max_branches)} branches`}
          sub={canSeeStaff ? `${limitLabel(staff.filter((s) => s.is_active).length + invites.length, ws.limits.max_employees)} staff · ${ws.plan_name}` : ws.plan_name}
          Icon={canSeeStaff ? Users2 : GitBranch}
          tone="bg-slate-100 text-slate-600"
        />
      </div>

      <div className={`${cardCls} p-5`}>
        <h3 className="font-black text-slate-900 text-sm mb-3">Daily sales</h3>
        <div className="h-56">
          {isMounted && chart.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chart} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="date" tick={{ fill: '#64748B', fontSize: 10 }} />
                <YAxis tick={{ fill: '#64748B', fontSize: 10 }} tickFormatter={(v) => formatNumber(v)} width={70} />
                <Tooltip formatter={(v) => `TZS ${formatNumber(Number(v))}`} />
                <Line type="monotone" dataKey="sales" stroke="#2563EB" strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-xs font-semibold text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
              No sales recorded in the selected dates. Sales from the cashier till appear here.
            </div>
          )}
        </div>
      </div>

      <OverviewAnalytics ws={ws} range={range} isMounted={isMounted} allSales={allSales} allExpenses={allExpenses} products={products} batches={batches} branches={branches} staff={staff} showFinance={showFinance} canSeeStaff={canSeeStaff} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className={`${cardCls} p-5`}>
          <h3 className="font-black text-slate-900 text-sm mb-3">Restock needed</h3>
          {lowStock.length === 0 ? (
            <Empty>All products are above their minimum stock.</Empty>
          ) : (
            <ul className="divide-y divide-slate-100 text-xs">
              {lowStock.slice(0, 8).map((p) => (
                <li key={p.id} className="py-2 flex items-center justify-between">
                  <span className="font-bold text-slate-800">{p.name} <span className="text-slate-400 font-medium">{p.strength}</span></span>
                  <span className={`px-2 py-0.5 rounded-md font-bold ${p.stock <= 0 ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-800'}`}>
                    {p.stock} left · min {p.min_stock_level}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className={`${cardCls} p-5`}>
          <h3 className="font-black text-slate-900 text-sm mb-3">Expiring soon</h3>
          {expiring.length === 0 ? (
            <Empty>No batches expire in the next {EXPIRY_WARNING_DAYS} days.</Empty>
          ) : (
            <ul className="divide-y divide-slate-100 text-xs">
              {expiring.slice(0, 8).map((b) => (
                <li key={b.id} className="py-2 flex items-center justify-between gap-2">
                  <span>
                    <span className="font-bold text-slate-800">{b.product_name}</span>
                    <span className="text-slate-400"> · {b.batch_number} · {branchName(b.branch_id)}</span>
                  </span>
                  <span className={`px-2 py-0.5 rounded-md font-bold whitespace-nowrap ${b.days_to_expiry <= 30 ? 'bg-rose-100 text-rose-700' : 'bg-orange-100 text-orange-800'}`}>
                    {b.days_to_expiry <= 0 ? 'Expired' : `${b.days_to_expiry} days`} · {formatDateDeterministic(b.expiry_date)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
