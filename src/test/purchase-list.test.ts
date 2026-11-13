import { describe, it, expect } from 'vitest';
import { parsePurchaseList, planPurchase } from '@/lib/supplier-match';

const cat = [
  { product_id: 'a', supplier_id: 's1', name: 'Paracetamol', strength: '500mg', unit_price: 100, stock: 30 },
  { product_id: 'b', supplier_id: 's2', name: 'Paracetamol', strength: '500mg', unit_price: 120, stock: 100 },
];
describe('purchase list', () => {
  it('reads headers and merges duplicate lines', () => {
    expect(parsePurchaseList([['Product', 'Strength', 'Qty'], ['Paracetamol', '500mg', '20'], ['paracetamol', '500mg', '30']]))
      .toEqual([{ name: 'Paracetamol', strength: '500mg', quantity: 50 }]);
  });
  it('splits a quantity across suppliers when the cheapest runs short', () => {
    const [r] = planPurchase([{ name: 'Paracetamol', strength: '500mg', quantity: 50 }], cat);
    expect(r!.picks.map((p) => [p.item.supplier_id, p.quantity])).toEqual([['s1', 30], ['s2', 20]]);
    expect(r!.missing).toBe(0);
  });
  it('reports what no supplier can cover', () => {
    expect(planPurchase([{ name: 'Paracetamol', quantity: 200 }], cat)[0]!.missing).toBe(70);
  });
});
