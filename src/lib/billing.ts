// Subscription rules shared by the signup form, the account page and the admin panel.
// The database applies the same rules (plan_yearly_price, create_registration, review_registration).

export const TRIAL_DAYS = 30;
export const TRIAL_PLAN_SLUG = 'starter';

export type AccountStatus = 'pending' | 'trial' | 'active' | 'expired' | 'suspended' | 'rejected';
export type BillingChoice = 'trial' | 'annual';

interface PricedPlan {
  slug: string;
  price_tzs_monthly: number;
  price_tzs_annual: number;
}

/** Discounted monthly rate x 12 — what the customer pays for one year. 0 means custom pricing. */
export function yearlyPrice(plan: PricedPlan): number {
  const monthly = plan.price_tzs_annual || plan.price_tzs_monthly || 0;
  return monthly * 12;
}

/** What one year would cost at the normal monthly rate (used to show savings). */
export function undiscountedYearlyPrice(plan: PricedPlan): number {
  return (plan.price_tzs_monthly || 0) * 12;
}

export function isCustomPriced(plan: PricedPlan): boolean {
  return yearlyPrice(plan) === 0;
}

/** Only the Starter plan can begin with the free 30-day trial; every other plan is paid yearly. */
export function offersTrial(planSlug: string): boolean {
  return planSlug === TRIAL_PLAN_SLUG;
}

export function resolveBillingChoice(planSlug: string, requested: BillingChoice): BillingChoice {
  return offersTrial(planSlug) ? requested : 'annual';
}

interface StatusRow {
  status: string;
  trial_ends_at?: string | null;
  subscription_ends_at?: string | null;
}

/** Status as the customer experiences it today: a trial or year that has run out counts as expired. */
export function effectiveStatus(row: StatusRow, now: Date = new Date()): AccountStatus {
  const s = row.status;
  if (s === 'trial') {
    if (!row.trial_ends_at || new Date(row.trial_ends_at) <= now) return 'expired';
    return 'trial';
  }
  if (s === 'active') {
    if (row.subscription_ends_at && new Date(row.subscription_ends_at) <= now) return 'expired';
    return 'active';
  }
  if (s === 'pending' || s === 'suspended' || s === 'rejected' || s === 'expired') return s;
  return 'pending';
}

export function daysLeft(dateIso: string | null | undefined, now: Date = new Date()): number {
  if (!dateIso) return 0;
  const ms = new Date(dateIso).getTime() - now.getTime();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

export const STATUS_LABELS: Record<AccountStatus, string> = {
  pending: 'Waiting for approval',
  trial: 'Free trial',
  active: 'Active (paid yearly)',
  expired: 'Expired',
  suspended: 'Suspended',
  rejected: 'Not approved',
};

export const PAYMENT_METHODS = [
  { value: 'mpesa', label: 'M-Pesa' },
  { value: 'tigopesa', label: 'Tigo Pesa (Mixx by Yas)' },
  { value: 'airtel_money', label: 'Airtel Money' },
  { value: 'halopesa', label: 'HaloPesa' },
  { value: 'bank_transfer', label: 'Bank transfer' },
] as const;

export function paymentMethodLabel(value: string): string {
  return PAYMENT_METHODS.find((m) => m.value === value)?.label ?? value.replace(/_/g, ' ');
}
