/** DESK DK2 — no-lookahead harness. Proves viewAsOf(detect(full), t) == detect(prefix(t)) at sampled
 *  times incl. each bar close ±1 ms. Every detector must register a check before merge. */
import { TF_SECONDS, type Candle, type Timeframe } from "@/types/market";
import type { AnalysisObject } from "@/desk/types/schemas";
import { closedBars } from "./closedBars";
import { viewAsOf } from "./viewAsOf";

export interface HarnessOptions<T> {
  detect: (bars: Candle[]) => T[];
  knownAt: (item: T) => number;
  /** Equality key (ids/anchors; default full JSON). */
  key?: (item: T) => string;
  /** As-of folding (default: filter known_at <= t). */
  view?: (items: T[], t: number) => T[];
  samples?: number;
}

export interface HarnessMismatch {
  t: number;
  onlyInFull: string[];
  onlyInPrefix: string[];
}

/** Sample closes (and ±1 ms) evenly across the series, skipping the first `warm` bars. */
export function sampleTimes(candles: readonly Candle[], tf: Timeframe, count: number, warm = 20): number[] {
  const sec = TF_SECONDS[tf];
  const lo = Math.min(warm, Math.max(0, candles.length - 1));
  const span = Math.max(1, candles.length - 1 - lo);
  const ts = new Set<number>();
  for (let k = 0; k < count; k++) {
    const i = lo + Math.round((k * span) / Math.max(1, count - 1));
    const close = (candles[i] as Candle).time + sec;
    ts.add(close - 0.001);
    ts.add(close);
    ts.add(close + 0.001);
  }
  return [...ts].sort((a, b) => a - b);
}

export function checkNoLookahead<T>(
  candles: readonly Candle[],
  tf: Timeframe,
  o: HarnessOptions<T>,
): HarnessMismatch[] {
  const key = o.key ?? ((x: T) => JSON.stringify(x));
  const view = o.view ?? ((items: T[], t: number) => items.filter((x) => o.knownAt(x) <= t));
  const full = o.detect(closedBars(candles, tf, Infinity));
  const bad: HarnessMismatch[] = [];
  for (const t of sampleTimes(candles, tf, o.samples ?? 40)) {
    const a = view(full, t).map(key).sort();
    const b = o.detect(closedBars(candles, tf, t)).map(key).sort();
    const bs = new Set(b);
    const as = new Set(a);
    const onlyInFull = a.filter((k) => !bs.has(k));
    const onlyInPrefix = b.filter((k) => !as.has(k));
    if (onlyInFull.length || onlyInPrefix.length) bad.push({ t, onlyInFull, onlyInPrefix });
  }
  return bad;
}

/** Convenience for AnalysisObject detectors (uses the shared viewAsOf path; ids are the key). */
export function checkObjectsNoLookahead(
  candles: readonly Candle[],
  tf: Timeframe,
  detect: (bars: Candle[]) => AnalysisObject[],
  samples = 40,
): HarnessMismatch[] {
  return checkNoLookahead<AnalysisObject>(candles, tf, {
    detect,
    knownAt: (o) => o.known_at,
    view: (items, t) => viewAsOf(items, t),
    key: (o) => JSON.stringify([o.id, o.known_at, o.confirmed_at, o.lifecycle]),
    samples,
  });
}