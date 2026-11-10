import { useEffect, useState, useSyncExternalStore } from 'react';
import { Link } from '@tanstack/react-router';
import { LayoutDashboard, GitBranch, Users2, Boxes, DollarSign, LogOut, AlertTriangle, ShoppingCart, ClipboardList } from 'lucide-react';
import type { Workspace } from '@/lib/pharmacy-types';
import { can, canOrderStock, isReadOnly, roleLabel } from '@/lib/workspace';
import { STATUS_LABELS } from '@/lib/billing';
import { presetRange, type DateRange } from '@/lib/date-range';
import { DateRangeFilter } from '@/components/dashboard/DateRangeFilter';
import { OverviewTab } from './OverviewTab';
import { BranchesTab } from './BranchesTab';
import { StaffTab } from './StaffTab';
import { InventoryTab } from './InventoryTab';
import { ExpensesTab } from './ExpensesTab';
import { MarketplaceTab } from './MarketplaceTab';
import { OrdersTab } from './OrdersTab';

const sub = () => () => {};

export function PharmacyWorkspace({ ws, all, userId, onSwitch, onSignOut }: { ws: Workspace; all: Workspace[]; userId: string; onSwitch: (id: string) => void; onSignOut: () => void }) {
  const isMounted = useSyncExternalStore(sub, () => true, () => false);
  const [tab, setTab] = useState('overview');
  const [range, setRange] = useState<DateRange | null>(null);
  useEffect(() => setRange(presetRange('last30')), []);
  const readOnly = isReadOnly(ws.status, ws.role);

  const nav = [
    { id: 'overview', label: 'Overview', Icon: LayoutDashboard, show: true },
    { id: 'inventory', label: ws.business_type === 'supplier' ? 'Wholesale catalog' : 'Inventory', Icon: Boxes, show: true },
    { id: 'restock', label: 'Restock (suppliers)', Icon: ShoppingCart, show: ws.business_type === 'pharmacy' && canOrderStock(ws.role) },
    { id: 'orders', label: ws.business_type === 'supplier' ? 'Wholesale orders' : 'Supplier orders', Icon: ClipboardList, show: canOrderStock(ws.role) },
    { id: 'branches', label: 'Branches', Icon: GitBranch, show: true },
    { id: 'staff', label: 'Staff & Roles', Icon: Users2, show: can(ws.role, 'manageBranches', 'active') },
    { id: 'expenses', label: 'Expenses', Icon: DollarSign, show: can(ws.role, 'viewFinance', ws.status) },
  ].filter((n) => n.show);

  return (
    <div className="min-h-screen bg-[#F4F6FA] text-slate-900 flex font-sans antialiased">
      <aside className="hidden md:flex w-60 bg-[#0F172A] text-slate-300 flex-col shrink-0">
        <div className="p-4 border-b border-slate-800 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-white font-black text-xl">+</div>
          <div><div className="font-extrabold text-white text-sm">Swahivo</div><div className="text-[11px] text-blue-400 font-bold">{ws.business_type === 'supplier' ? 'Supplier Dashboard' : 'Pharmacy Dashboard'}</div></div>
        </div>
        <nav className="p-3 space-y-1 flex-1">
          {nav.map((n) => (
            <button key={n.id} onClick={() => setTab(n.id)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold ${tab === n.id ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 hover:text-white'}`}>
              <n.Icon className="w-4 h-4" /> {n.label}
            </button>))}
        </nav>
        <div className="p-3 border-t border-slate-800"><button onClick={onSignOut} className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold hover:bg-slate-800"><LogOut className="w-3.5 h-3.5" /> Sign out</button></div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="bg-white border-b border-slate-200 px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {all.length > 1 ? (
              <select aria-label="Pharmacy" className="font-black text-slate-900 bg-transparent text-sm max-w-[220px]" value={ws.id} onChange={(e) => onSwitch(e.target.value)}>
                {all.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            ) : <span className="font-black text-slate-900 text-sm truncate">{ws.name}</span>}
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 whitespace-nowrap">{ws.plan_name} · {STATUS_LABELS[ws.status]}</span>
          </div>
          <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 whitespace-nowrap">{roleLabel(ws.role)}</span>
        </header>
        <div className="md:hidden flex overflow-x-auto gap-1 bg-white border-b border-slate-200 px-2 py-2">
          {nav.map((n) => <button key={n.id} onClick={() => setTab(n.id)} className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap ${tab === n.id ? 'bg-blue-600 text-white' : 'text-slate-600'}`}>{n.label}</button>)}
        </div>

        <main className="p-4 sm:p-6 space-y-6 max-w-[1500px] w-full mx-auto">
          {readOnly && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm text-rose-900">
              <div className="flex items-center gap-2 font-bold"><AlertTriangle className="w-4 h-4" />
                {ws.status === 'pending' ? 'Waiting for admin approval — you can look around but not make changes yet.' : `This account is ${STATUS_LABELS[ws.status].toLowerCase()}. Everything is read-only until the yearly payment is confirmed.`}
              </div>
              {ws.role === 'owner' && <Link to="/account" className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold whitespace-nowrap">{ws.status === 'pending' ? 'View status' : 'Pay yearly'}</Link>}
            </div>)}
          {(tab === 'overview' || tab === 'expenses') && (
            <div className="flex justify-end"><DateRangeFilter value={range} onChange={setRange} /></div>)}
          {tab === 'overview' && <OverviewTab ws={ws} range={range} isMounted={isMounted} />}
          {tab === 'inventory' && <InventoryTab ws={ws} userId={userId} />}
          {tab === 'restock' && <MarketplaceTab ws={ws} userId={userId} onOrdered={() => setTab('orders')} />}
          {tab === 'orders' && <OrdersTab ws={ws} />}
          {tab === 'branches' && <BranchesTab ws={ws} />}
          {tab === 'staff' && <StaffTab ws={ws} />}
          {tab === 'expenses' && <ExpensesTab ws={ws} userId={userId} range={range} />}
        </main>
      </div>
    </div>
  );
}
