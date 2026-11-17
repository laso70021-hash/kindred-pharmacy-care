import { describe, expect, it } from 'vitest';
import { trackingUrl, whatsappDigits, whatsappTrackingUrl } from './delivery-links';

describe('delivery links', () => {
  it('builds the public tracking page link for a delivery', () => {
    expect(trackingUrl('abc', 'https://swahivo.com')).toBe('https://swahivo.com/track/abc');
  });
  it('turns a local 07 number into a 255 WhatsApp number', () => {
    expect(whatsappDigits('0771 888 881')).toBe('255771888881');
  });
  it('sends the tracking link straight to the customer chat', () => {
    const u = whatsappTrackingUrl('Paman', 'PAP16112026', 'https://swahivo.com/track/abc', '+255 674 766 586');
    expect(u.startsWith('https://wa.me/255674766586?text=')).toBe(true);
    expect(decodeURIComponent(u)).toContain('https://swahivo.com/track/abc');
  });
});
