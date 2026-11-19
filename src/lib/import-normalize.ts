import type { EntryField } from './entry-model';

const MONTHS = ['january','february','march','april','may','june','july','august','september','october','november','december'];
const monthIndex = (s: string) => MONTHS.findIndex(m => m === s.toLowerCase() || m.slice(0, 3) === s.toLowerCase().slice(0, 3) && s.length >= 3);
const lastDay = (y: number, m: number) => `${y}-${String(m + 1).padStart(2, '0')}-${String(new Date(Date.UTC(y, m + 1, 0)).getUTCDate()).padStart(2, '0')}`;

/** Common spreadsheet headings mapped to import fields (normalized: lowercase letters/digits only). */
export const HEADER_ALIASES: Record<string, string[]> = {
  name: ['brandname', 'productname', 'name', 'itemname'],
  sku: ['sku', 'id', 'code', 'productcode', 'itemcode'],
  unit_of_measurement: ['sellingunit', 'unit', 'unitofmeasurement', 'uom'],
  cost_price: ['buyingprice', 'costprice', 'purchaseprice', 'cost'],
  selling_price: ['sellingprice', 'price', 'retailprice'],
  quantity: ['quantity', 'qty', 'stock', 'openingstock', 'stockquantity'],
  batch_number: ['batchno', 'batchnumber', 'batch'],
  expiry_date: ['expirymonth', 'expirydate', 'expiry', 'exp'],
  min_stock_level: ['reorderlevel', 'minstocklevel', 'minstock'],
};

/** Turns "TZS 1,500" into "1500" and "2029 - November" into the last day of that month. */
export function normalizeImportValue(field: EntryField, raw: string): string {
  const v = (raw ?? '').trim();
  if (!v || v === '-') return field.type === 'number' || field.type === 'integer' || field.type === 'date' ? '' : v === '-' ? '' : v;
  if (field.type === 'number' || field.type === 'integer') {
    const cleaned = v.replace(/tzs|tsh|\s|,/gi, '');
    return cleaned;
  }
  if (field.type === 'date') {
    let m = v.match(/^(\d{4})\s*[-/ ]\s*([A-Za-z]+)$/);
    if (m && monthIndex(m[2]!) >= 0) return lastDay(Number(m[1]), monthIndex(m[2]!));
    m = v.match(/^([A-Za-z]+)\s*[-/ ]\s*(\d{4})$/);
    if (m && monthIndex(m[1]!) >= 0) return lastDay(Number(m[2]), monthIndex(m[1]!));
    m = v.match(/^(\d{4})-(\d{1,2})$/);
    if (m) return lastDay(Number(m[1]), Number(m[2]) - 1);
    m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
  }
  return v;
}
