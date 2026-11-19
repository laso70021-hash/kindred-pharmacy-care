import { describe, expect, it } from 'vitest';
import { normalizeImportValue } from './import-normalize';
const num = { key: 'cost_price', label: 'c', type: 'number' as const };
const date = { key: 'expiry_date', label: 'e', type: 'date' as const };
describe('import normalization', () => {
  it('strips TZS prefix and thousands commas', () => expect(normalizeImportValue(num, 'TZS 1,500')).toBe('1500'));
  it('turns "2029 - November" into the last day of the month', () => expect(normalizeImportValue(date, '2029 - November')).toBe('2029-11-30'));
  it('handles leap-year February', () => expect(normalizeImportValue(date, '2028 - February')).toBe('2028-02-29'));
  it('treats "-" as empty', () => expect(normalizeImportValue(date, '-')).toBe(''));
});
