import logo from '@/assets/brand/swahivo_logo.webp';
import mark from '@/assets/brand/swahivo_mark.png';

/** Swahivo brand + public contact details — one source for the site, emails and receipts. */
export const BRAND = {
  name: 'Swahivo',
  logoUrl: logo,
  markUrl: mark,
  email: 'info@swahivo.com',
  enterpriseEmail: 'hello@swahivo.com',
  phones: ['0771 888 881', '0674 766 586'],
} as const;

export const telHref = (phone: string) => `tel:+255${phone.replace(/\D/g, '').replace(/^0/, '')}`;
