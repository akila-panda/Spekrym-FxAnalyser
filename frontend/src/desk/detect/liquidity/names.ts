/** DESK DK9 — display names for liquidity_pool / sweep. Copy is neutral: pools are "potential"; no prediction language. */
import type { AnalysisObject } from "@/desk/types/schemas";

export function liquidityName(o: Pick<AnalysisObject, "type" | "direction" | "grade">): string | null {
  if (o.type !== "liquidity_pool" && o.type !== "sweep") return null;
  const side = o.direction === "bear" ? "highs" : "lows";
  if (o.type === "liquidity_pool") return `Potential pool · equal ${side}`;
  const close = o.grade?.factors.some((f) => f.id === "close_beyond");
  return `${close ? "Close beyond" : "Wick sweep"} · equal ${side}`;
}