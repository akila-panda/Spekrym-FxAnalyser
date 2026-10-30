/** DESK DK8 — nearest-N active gaps to a price. Pure. Active = open or partially filled (not filled/invalidated/inverted). */
import { lifecycleState } from "@/desk/kernel/viewAsOf";
import { DEFAULTS } from "@/desk/methodology/defaults";
import type { AnalysisObject } from "@/desk/types/schemas";

const FVG_SPENT = new Set(["filled", "invalidated", "inverted"]);
export const isFvgActive = (o: AnalysisObject): boolean => o.type === "fvg" && !FVG_SPENT.has(lifecycleState(o) ?? "");

const gap = (o: AnalysisObject, price: number): number => {
  const b = o.geometry.bands[0];
  return !b ? Infinity : price < b.pLow ? b.pLow - price : price > b.pHigh ? price - b.pHigh : 0;
};

export function nearestFvgs(objects: readonly AnalysisObject[], price: number, n: number = DEFAULTS.fvg.nearestN): AnalysisObject[] {
  return objects.filter(isFvgActive)
    .map((o) => ({ o, d: gap(o, price) }))
    .sort((x, y) => x.d - y.d || y.o.known_at - x.o.known_at || (x.o.id < y.o.id ? -1 : 1))
    .slice(0, Math.max(0, n)).map((x) => x.o);
}