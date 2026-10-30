/** DESK DK19 — pure statistics: Wilson interval, grouping and small-sample suppression. */
import { MIN_N, Z95, type MetricId } from "./protocol";
import type { Obs } from "./observe";

export function wilson(k: number, n: number, z = Z95): { lo: number; hi: number } | null {
  if (n <= 0 || k < 0 || k > n) return null;
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return { lo: Math.max(0, c - h), hi: Math.min(1, c + h) };
}

export type Dim = "type" | "pair" | "session" | "tf" | "cohort";
export const DIM_LABEL: Record<Dim, string> = { type: "Type", pair: "Pair", session: "Session", tf: "Timeframe", cohort: "Nested vs single" };

export function typeLabel(o: Pick<Obs, "type" | "direction">): string {
  if (o.type === "sd_zone") return o.direction === "bear" ? "Supply zone" : "Demand zone";
  if (o.type === "fvg") return o.direction === "bear" ? "Bear FVG" : "Bull FVG";
  return o.direction === "bear" ? "Sweep of highs" : "Sweep of lows";
}

export const groupKey = (o: Obs, dim: Dim): string =>
  dim === "type" ? typeLabel(o) : dim === "pair" ? o.pair : dim === "session" ? o.session : dim === "tf" ? o.tf : (o.cohort ?? "n/a");

export interface Row { key: string; n: number; k: number; suppressed: boolean; rate: number | null; lo: number | null; hi: number | null }

export function toRow(key: string, k: number, n: number, minN = MIN_N): Row {
  const w = n >= minN ? wilson(k, n) : null;
  return { key, n, k, suppressed: n < minN, rate: n >= minN ? k / n : null, lo: w?.lo ?? null, hi: w?.hi ?? null };
}

/** "All" first, then groups by key. Cohort rows exist only for metrics that carry a cohort (reaction). */
export function aggregate(obs: readonly Obs[], metric: MetricId, dim: Dim, minN = MIN_N): Row[] {
  const sel = obs.filter((o) => o.metric === metric && (dim !== "cohort" || o.cohort !== null));
  const groups = new Map<string, { k: number; n: number }>();
  for (const o of sel) {
    const g = groups.get(groupKey(o, dim)) ?? { k: 0, n: 0 };
    g.n += 1;
    if (o.success) g.k += 1;
    groups.set(groupKey(o, dim), g);
  }
  const rows = [...groups.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([key, g]) => toRow(key, g.k, g.n, minN));
  const all = toRow("All", sel.filter((o) => o.success).length, sel.length, minN);
  return sel.length ? [all, ...rows] : [];
}