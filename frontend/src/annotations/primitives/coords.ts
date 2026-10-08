import type { Logical } from "lightweight-charts";
import type { Coordinates } from "./types";

/** Index of the last bar with `time <= t`, or -1 when `t` is before the first bar. */
export function lastIndexAtOrBefore(bars: readonly { time: number }[], t: number): number {
  let lo = 0;
  let hi = bars.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((bars[mid]?.time ?? Infinity) <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo - 1;
}

/** Fractional logical index for `time`. A bar's open time maps to its centre (integer index).
 *  Inside a bar the position is fractional, so a zone formed within one H1 bar keeps a width.
 *  Before the first and after the last bar it extrapolates using the timeframe length; across a
 *  data gap (weekend) the fraction is capped at the next bar. Null when there are no bars. */
export function timeToLogical(time: number, bars: readonly { time: number }[], barSeconds: number): number | null {
  const n = bars.length;
  if (n === 0 || barSeconds <= 0) return null;
  const i = lastIndexAtOrBefore(bars, time);
  if (i < 0) return (time - (bars[0]?.time ?? 0)) / barSeconds;
  const t = bars[i]?.time ?? 0;
  if (i === n - 1) return i + (time - t) / barSeconds;
  return i + Math.min((time - t) / barSeconds, 1);
}

/** Clamp the span [a, b] to [lo, hi]. Null when it lies completely outside. */
export function clampSpan(a: number, b: number, lo: number, hi: number): { start: number; end: number } | null {
  const s = Math.min(a, b);
  const e = Math.max(a, b);
  if (e < lo || s > hi) return null;
  return { start: Math.max(s, lo), end: Math.min(e, hi) };
}

interface TimeScaleLike {
  logicalToCoordinate(l: Logical): number | null;
}
interface SeriesLike {
  priceToCoordinate(p: number): number | null;
}

export function makeCoordinates(
  timeScale: TimeScaleLike,
  series: SeriesLike,
  getBars: () => readonly { time: number }[],
  barSeconds: number,
): Coordinates {
  return {
    timeX(time) {
      const l = timeToLogical(time, getBars(), barSeconds);
      return l === null ? null : timeScale.logicalToCoordinate(l as Logical);
    },
    priceY: (price) => series.priceToCoordinate(price),
  };
}