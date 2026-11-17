export function trackingUrl(jobId: string, origin = typeof window === 'undefined' ? '' : window.location.origin): string {
  return `${origin}/track/${jobId}`;
}

/** Normalise a Tanzanian/E.164 number to wa.me digits (0712… → 255712…). */
export function whatsappDigits(phone: string | null | undefined): string {
  let d = (phone || '').replace(/\D/g, '');
  if (d.startsWith('0')) d = `255${d.slice(1)}`;
  return d;
}

export function whatsappTrackingUrl(business: string, tracking: string, url: string, phone?: string | null): string {
  const text = `Hello! Your order from ${business} is on its way. Tracking number: ${tracking}. Follow your delivery live here: ${url}`;
  return `https://wa.me/${whatsappDigits(phone)}?text=${encodeURIComponent(text)}`;
}
