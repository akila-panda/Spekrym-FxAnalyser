/** DESK DK18 — replay clock. Pure: the grid of closed-bar times for a step TF, and stepping/scrubbing on it.
 *  Positions are bar-close times (UTC s) or "latest"; they feed deskUiStore.asOf only (never viewStore.asOf). */
import { deepCandles } from "@/desk/mock/deepMock";
import { TF_SECONDS, type Pair, type Timeframe } from "@/types/market";

export const STEP_TFS = ["H1", "M15", "M5"] as const satisfies readonly Timeframe[];
export type StepTf = (typeof STEP_TFS)[number];
export const SPEEDS = [1, 2, 4] as const;
export type Speed = (typeof SPEEDS)[number];
/** Bars before the end that replay starts from when played from "latest". */
export const START_BACK = 96;
export type ReplayAsOf = "latest" | number;

export const tickMs = (speed: Speed): number => Math.round(1000 / speed);

const cache = new Map<string, readonly number[]>();
/** Close time of every closed bar of `tf` (ascending). Last entry = the latest closed bar. */
export function closeTimes(pair: Pair, tf: StepTf): readonly number[] {
  const k = `${pair}|${tf}`;
  const hit = cache.get(k);
  if (hit) return hit;
  const out = deepCandles(pair, tf).map((c) => c.time + TF_SECONDS[tf]);
  cache.set(k, out);
  return out;
}

/** Index of the last close <= t (-1 when t precedes the grid). */
export function indexAtOrBefore(times: readonly number[], t: number): number {
  let lo = 0;
  let hi = times.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((times[mid] as number) <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

export const positionOf = (times: readonly number[], asOf: ReplayAsOf): number =>
  asOf === "latest" ? times.length - 1 : Math.max(0, indexAtOrBefore(times, asOf));

/** Grid index -> as-of ("latest" at/after the last close). */
export function scrubTo(times: readonly number[], index: number): ReplayAsOf {
  if (times.length < 2 || index >= times.length - 1) return "latest";
  return times[Math.max(0, Math.floor(index))] as number;
}

/** One step forward (+1) or back (-1). Forward from the last bar stays "latest"; back stops at the first bar. */
export function stepFrom(times: readonly number[], asOf: ReplayAsOf, dir: 1 | -1): ReplayAsOf {
  return scrubTo(times, positionOf(times, asOf) + dir);
}

export const startPoint = (times: readonly number[]): ReplayAsOf => scrubTo(times, times.length - 1 - START_BACK);

/** True when the user asked the OS for reduced motion (play/animation is then unavailable; stepping remains). */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}