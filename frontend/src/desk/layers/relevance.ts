/** DESK DK3 — relevance filter for projected objects: keep only those within k×ATR(viewTf) of price. Pure. */
import { DEFAULTS } from "@/desk/methodology/defaults";
import type { AnalysisObject } from "@/desk/types/schemas";

/** Distance from `price` to the object's nearest price edge (0 when inside). null when it has no price geometry. */
export function distanceToObject(o: AnalysisObject, price: number): number | null {
  let best: number | null = null;
  const consider = (lo: number, hi: number) => {
    const d = price < lo ? lo - price : price > hi ? price - hi : 0;
    best = best === null ? d : Math.min(best, d);
  };
  for (const b of o.geometry.bands) consider(b.pLow, b.pHigh);
  if (best === null) for (const p of o.geometry.points ?? []) consider(p.p, p.p);
  return best;
}

export function isRelevant(
  o: AnalysisObject, price: number | null, atrView: number | null, k: number = DEFAULTS.relevanceAtr,
): boolean {
  if (price === null || atrView === null || atrView <= 0) return true;
  const d = distanceToObject(o, price);
  return d === null || d <= k * atrView;
}