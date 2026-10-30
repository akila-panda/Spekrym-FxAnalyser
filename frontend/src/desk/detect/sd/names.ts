/** DESK DK10 — display names + role for sd_zone, derived only from the object. Copy is neutral. */
import type { AnalysisObject } from "@/desk/types/schemas";

type Z = Pick<AnalysisObject, "type" | "direction" | "grade">;
const has = (o: Z, id: string): boolean => !!o.grade?.factors.some((f) => f.id === id);
/** OB-only zones have no qualifying base (the base factor opposes). */
const obOnly = (o: Z): boolean => has(o, "order_block") && !!o.grade?.factors.some((f) => f.id === "base" && f.status === "opposes");

export const isOrderBlock = (o: Z): boolean => o.type === "sd_zone" && has(o, "order_block");

export function zoneName(o: Z): string | null {
  if (o.type !== "sd_zone") return null;
  const bull = o.direction === "bull";
  if (obOnly(o)) return `${bull ? "Bullish" : "Bearish"} order block`;
  return `${bull ? "Demand" : "Supply"} zone${has(o, "order_block") ? " · OB" : ""}`;
}