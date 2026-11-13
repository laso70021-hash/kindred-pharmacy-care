import { describe, it, expect } from 'vitest';
import { homeFor, HOME_COPY } from '@/lib/role-home';

describe('role home dashboards', () => {
  it('owners, admins and managers keep the full business overview', () => {
    expect(homeFor('owner')).toBe('business');
    expect(homeFor('admin')).toBe('business');
    expect(homeFor('manager')).toBe('business');
  });
  it('each staff role gets its own home', () => {
    expect(homeFor('cashier')).toBe('cashier');
    expect(homeFor('pharmacist')).toBe('pharmacist');
    expect(homeFor('inventory_manager')).toBe('inventory');
    expect(homeFor('accountant')).toBe('accountant');
    expect(homeFor('delivery_rider')).toBe('rider');
  });
  it('cashiers are not offered finance or ordering shortcuts', () => {
    const tabs = HOME_COPY.cashier.actions.map((a) => a.tab);
    expect(tabs).not.toContain('expenses');
    expect(tabs).not.toContain('restock');
  });
});
