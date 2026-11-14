import { describe, it, expect } from 'vitest';
import { COVLO_ROLES, covloPrompts } from '@/lib/covlo';
describe('Covlo roles', () => {
  it('has advice for every requested role', () => {
    for (const r of ['pharmacy_owner','pharmacist','cashier','manager','accountant','supplier','delivery_rider']) expect(COVLO_ROLES[r]).toBeDefined();
  });
  it('falls back to manager prompts for unknown roles', () => { expect(covloPrompts('x')).toEqual(COVLO_ROLES['manager']!.prompts); });
});
