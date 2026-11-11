import logo from '@/assets/brand/swahivo_logo.webp.asset.json';
import mark from '@/assets/brand/swahivo_mark.png.asset.json';

/** Swahivo brand + public contact details — one source for the site, emails and receipts. */
export const BRAND = {
  name: 'Swahivo Pharmacy AI',
  logoUrl: logo.url,
  markUrl: mark.url,
  email: 'info@swahivo.com',
  enterpriseEmail: 'hello@swahivo.com',
  phones: ['0771 888 881', '0674 766 586'],
} as const;

export const telHref = (phone: string) => `tel:+255${phone.replace(/\D/g, '').replace(/^0/, '')}`;
