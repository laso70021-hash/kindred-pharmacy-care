// Matches a medicine a pharmacy needs against suppliers' published catalog items.
export interface RestockPrefill { name: string; generic?: string; strength?: string; quantity: number; branchId?: string }

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const words = (s: string) => norm(s).split(' ').filter((w) => w.length > 1);

/** Score 0..1 — 1 when every word of the needed name (and strength) is found in the item. 0 = no match. */
export function matchScore(need: { name: string; generic?: string | undefined; strength?: string | undefined }, item: { name: string; generic_name?: string; strength?: string }): number {
  const hay = ` ${norm(`${item.name} ${item.generic_name ?? ''} ${item.strength ?? ''}`)} `;
  const nameWords = words(need.name);
  const byName = nameWords.length ? nameWords.filter((w) => hay.includes(` ${w} `) || hay.includes(` ${w}`)).length / nameWords.length : 0;
  const byGeneric = need.generic && words(need.generic).length ? words(need.generic).every((w) => hay.includes(` ${w}`)) ? 0.9 : 0 : 0;
  let score = Math.max(byName, byGeneric);
  if (score < 0.6) return 0;
  const sw = need.strength ? words(need.strength) : [];
  if (sw.length && !sw.every((w) => hay.includes(` ${w}`))) score *= 0.7;
  return Math.round(score * 100) / 100;
}

/** Matching in-stock-first items, best match then cheapest. */
export function matchCatalog<T extends { name: string; generic_name?: string; strength?: string; unit_price: number; stock: number }>(need: RestockPrefill, catalog: T[]): (T & { score: number })[] {
  return catalog.map((c) => ({ ...c, score: matchScore(need, c) })).filter((c) => c.score > 0)
    .sort((a, b) => Number(b.stock > 0) - Number(a.stock > 0) || b.score - a.score || a.unit_price - b.unit_price);
}
