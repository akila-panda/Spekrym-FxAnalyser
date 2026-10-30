/** DX9: pure maths for the Overview strip: tick positions, clustering, focus window, drag mapping. */
import type { SetupRow } from "@/scan/selectors";
import type { Timeframe } from "@/types/market";

export type OvRange = readonly [number, number];

export interface OvTick {
  key: string;
  tf: Timeframe;
  id: string;
  /** UTC seconds: the setup's focus start. */
  t: number;
  dir: "long" | "short";
}

export interface OvCluster {
  /** Mean x of the members, px. */
  x: number;
  items: OvTick[];
}

/** Ticks closer than this (px) merge into one count badge. */
export const CLUSTER_PX = 3;
/** The range never gets narrower than this, so one setup still has room. */
export const MIN_SPAN_SEC = 3600;
export const WINDOW_MIN_PX = 4;

export function ticksFrom(rows: readonly SetupRow[]): OvTick[] {
  return rows.map(({ key, tf, setup }) => ({ key, tf, id: setup.id, t: setup.focus.from, dir: setup.direction === "short" ? "short" : "long" }));
}

/** [first tick, last tick], widened to at least `MIN_SPAN_SEC`. Null when there are no ticks. */
export function overviewRange(times: readonly number[]): OvRange | null {
  if (times.length === 0) return null;
  let lo = Infinity;
  let hi = -Infinity;
  for (const t of times) {
    if (t < lo) lo = t;
    if (t > hi) hi = t;
  }
  if (hi - lo < MIN_SPAN_SEC) {
    const mid = (lo + hi) / 2;
    return [mid - MIN_SPAN_SEC / 2, mid + MIN_SPAN_SEC / 2];
  }
  return [lo, hi];
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

export function xOf(t: number, range: OvRange, width: number): number {
  const span = range[1] - range[0];
  return span <= 0 ? 0 : clamp01((t - range[0]) / span) * Math.max(0, width);
}

/** Time under pixel `x`, clamped to the range. Used for click and drag. */
export function timeAt(x: number, range: OvRange, width: number): number {
  if (width <= 0) return range[0];
  return Math.round(range[0] + clamp01(x / width) * (range[1] - range[0]));
}

/** A drag to pixel `x` becomes this focus anchor: always inside the scan range. */
export const anchorAtX = timeAt;

/** Keyboard move of the window: one `step` seconds either way, clamped to the range. */
export function stepAnchor(anchor: number, dir: 1 | -1, step: number, range: OvRange): number {
  return Math.min(range[1], Math.max(range[0], anchor + dir * step));
}

/** Ticks sorted by time; neighbours closer than `gap` px share a cluster. */
export function clusterTicks(ticks: readonly OvTick[], range: OvRange, width: number, gap: number = CLUSTER_PX): OvCluster[] {
  const sorted = [...ticks].sort((a, b) => a.t - b.t || a.key.localeCompare(b.key));
  const out: { xs: number[]; items: OvTick[]; last: number }[] = [];
  for (const tick of sorted) {
    const x = xOf(tick.t, range, width);
    const cur = out[out.length - 1];
    if (cur && x - cur.last < gap) {
      cur.xs.push(x);
      cur.items.push(tick);
      cur.last = x;
    } else out.push({ xs: [x], items: [tick], last: x });
  }
  return out.map((c) => ({ x: c.xs.reduce((s, v) => s + v, 0) / c.xs.length, items: c.items }));
}

/** Which member a click selects: the first, or the one after the active member (wraps). */
export function pickFromCluster(cluster: OvCluster, activeKey: string | null): OvTick {
  const i = cluster.items.findIndex((t) => t.key === activeKey);
  return cluster.items[i < 0 ? 0 : (i + 1) % cluster.items.length]!;
}

/** The focus interval as a window on the strip: clamped inside the track, never thinner than `WINDOW_MIN_PX`. */
export function windowRect(interval: readonly [number, number], range: OvRange, width: number): { left: number; width: number } {
  const a = xOf(interval[0], range, width);
  const b = xOf(interval[1], range, width);
  const w = Math.min(Math.max(WINDOW_MIN_PX, b - a), Math.max(WINDOW_MIN_PX, width));
  return { left: Math.min(a, Math.max(0, width - w)), width: w };
}