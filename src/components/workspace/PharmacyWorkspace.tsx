import { RecordsTab } from './RecordsTab';
import { ImportsTab } from './ImportsTab';
import { BRAND } from '@/lib/brand';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Link } from '@tanstack/react-router';
import { LayoutDashboard, GitBranch, Users2, Boxes, DollarSign, LogOut, AlertTriangle, ShoppingCart, ClipboardList, Store, Pill } from 'lucide-react';
import type { Workspace } from '@/lib/pharmacy-types';
import { can, canOrderStock, isReadOnly, roleLabel } from '@/lib/workspace';
import { STATUS_LABELS, expiryReminder } from '@/lib/billing';
import { NotificationBell, type ExtraNotice } from '@/components/common/NotificationBell';
import { ReportButton } from './ReportButton';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BrandingService } from '@/lib/pharmacy-service';
import { toast } from 'sonner';
import { presetRange, type DateRange } from '@/lib/date-range';
import { DateRangeFilter } from '@/components/dashboard/DateRangeFilter';
import { OverviewTab } from './OverviewTab';
import { BranchesTab } from './BranchesTab';
import { StaffTab } from './StaffTab';
import { InventoryTab } from './InventoryTab';
import { ExpensesTab } from './ExpensesTab';
import { MarketplaceTab } from './MarketplaceTab';
import { OrdersTab } from './OrdersTab';
import { PosTab } from './PosTab';
import { DispenserTab } from './DispenserTab';

const sub = () => () => {};

export function PharmacyWorkspace({ ws, all, userId, onSwitch, onSignOut }: { ws: Workspace; all: Workspace[]; userId: string; onSwitch: (id: string) => void; onSignOut: () => void }) {
  const isMounted = useSyncExternalStore(sub, () => true, () => false);
  const [tab, setTab] = useState('overview');
  const [range, setRange] = useState<DateRange | null>(null);
  useEffect(() => setRange(presetRange('last30')), []);
  const readOnly = isReadOnly(ws.status, ws.role);
  const qc = useQueryClient();
  const { data: logo } = useQuery({ queryKey: ['logo', ws.id], queryFn: () => BrandingService.getLogoUrl(ws.id) });
  const uploadLogo = async (f: File | undefined) => {
    if (!f) return;
    try { await BrandingService.uploadLogo(ws.id, f); toast.success('Logo updated'); void qc.invalidateQueries({ queryKey: ['logo', ws.id] }); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Upload failed'); }
  };
  const rem = isMounted && ws.role === 'owner' ? expiryReminder(ws.status === 'trial' ? ws.trial_ends_at : ws.subscription_ends_at) : null;
  const extra: ExtraNotice[] = rem ? [{ id: 'expiry', kind: 'warning', link: '/account',
    title: rem.level === 'expired' ? 'Your account has expired' : `Your ${ws.status === 'trial' ? 'free trial' : 'yearly plan'} ends in ${rem.days} day${rem.days === 1 ? '' : 's'}`,
    body: 'Pay the yearly plan to keep using every feature.' }] : [];

  const nav = [
    { id: 'overview', label: 'Overview', Icon: LayoutDashboard, show: true },
    { id: 'pos', label: 'Cashier (POS)', Icon: Store, show: ws.business_type === 'pharmacy' && can(ws.role, 'sell', 'active') },
    { id: 'rx', label: 'Prescriptions', Icon: Pill, show: ws.business_type === 'pharmacy' && can(ws.role, 'sell', 'active') },
    { id: 'imports', label: 'Bulk imports', Icon: ClipboardList, show: can(ws.role, 'manageStock', 'active') || can(ws.role, 'manageStaff', 'active') },
    { id: 'suppliers', label: 'Suppliers', Icon: Store, show: can(ws.role, 'manageStock', 'active') },
    { id: 'categories', label: 'Categories', Icon: Boxes, show: can(ws.role, 'manageStock', 'active') },
    { id: 'settings', label: 'Business settings', Icon: GitBranch, show: ws.role === 'owner' || ws.role === 'admin' },
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
          <label title={ws.role === 'owner' ? 'Upload logo' : ws.name} className={`w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-white font-black text-xl overflow-hidden shrink-0 ${ws.role === 'owner' ? 'cursor-pointer' : ''}`}>
            {logo ? <img src={logo} alt={`${ws.name} logo`} className="w-full h-full object-cover" /> : <img src={BRAND.markUrl} alt="Swahivo" className="w-full h-full object-cover" />}
            {ws.role === 'owner' && <input type="file" accept="image/*" className="hidden" onChange={(e) => void uploadLogo(e.target.files?.[0])} />}
          </label>
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
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 min-w-0 flex-1">
            {all.length > 1 ? (
              <select aria-label="Pharmacy" className="font-black text-slate-900 bg-transparent text-sm w-full sm:w-auto max-w-[220px] min-w-0" value={ws.id} onChange={(e) => onSwitch(e.target.value)}>
                {all.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            ) : <span className="font-black text-slate-900 text-sm truncate">{ws.name}</span>}
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 self-start truncate max-w-full">{ws.plan_name} · {STATUS_LABELS[ws.status]}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0"><NotificationBell extra={extra} /><span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 whitespace-nowrap">{roleLabel(ws.role)}</span></div>
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
            <div className="flex justify-end gap-2">{can(ws.role, 'viewFinance', 'active') && <ReportButton ws={ws} range={range} />}<DateRangeFilter value={range} onChange={setRange} /></div>)}
          {tab === 'overview' && <OverviewTab ws={ws} range={range} isMounted={isMounted} />}
          {tab === 'imports' && <ImportsTab ws={ws} />}
          {(['suppliers','categories','settings'] as const).map(module => tab === module && <RecordsTab key={module} ws={ws} module={module} />)}
          {tab === 'inventory' && <InventoryTab ws={ws} userId={userId} />}
          {tab === 'pos' && <PosTab ws={ws} />}
          {tab === 'rx' && <DispenserTab ws={ws} userId={userId} />}
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
