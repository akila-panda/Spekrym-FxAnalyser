/** DESK DK11 — display names for trendline / candle_signal. Copy is neutral; no prediction language. */
import type { AnalysisObject } from "@/desk/types/schemas";

export function paName(o: Pick<AnalysisObject, "type" | "direction" | "grade">): string | null {
  if (o.type === "trendline") return o.direction === "bull" ? "Rising support line" : "Falling resistance line";
  if (o.type === "candle_signal") return o.grade?.factors.find((f) => f.id === "pattern")?.label ?? "Candle signal";
  return null;
}