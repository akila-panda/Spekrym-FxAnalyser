/** S2: pure alignment math for the MTF stack. Parents come from ACTUAL bars; calendar is a fallback only.
 *  All intervals are half-open [open, close). Times are UTC seconds, so DST never shifts a boundary. */
import { bucketStart, TF_SECONDS, type Candle, type Timeframe } from "@/types/market";

/** A parent may be this much longer than nominal (a 25h D bar on a DST fall-back day). */
export const DST_SLACK_SEC = 3600;

export interface ParentSpan {
  tf: Timeframe;
  open: number;
  /** Real end: min(next parent open, nominal end), or the next open when within DST slack of nominal. */
  close: number;
  /** True when `asOf` falls before `close`: the parent is still forming. */
  forming: boolean;
  /** True when derived from the calendar because no actual parent bar covered the time. */
  calendar: boolean;
}

export interface ChildCount {
  /** Children actually present (and known at `asOf`). */
  present: number;
  /** Children a complete parent would hold, from the span length. */
  expected: number;
  /** present < expected: show `~`, muted. */
  partial: boolean;
}

const inSpan = (t: number, open: number, close: number): boolean => t >= open && t < close;

function closeOf(tf: Timeframe, open: number, nextOpen: number | undefined): number {
  const nominal = open + TF_SECONDS[tf];
  if (nextOpen === undefined || nextOpen <= open) return nominal;
  const gap = nextOpen - open;
  if (gap > TF_SECONDS[tf] && gap <= TF_SECONDS[tf] + DST_SLACK_SEC) return nextOpen;
  return Math.min(nominal, nextOpen);
}

/** Index of the last bar with time <= t, or -1. Bars must be ascending. */
function lastAtOrBefore(bars: readonly Candle[], t: number): number {
  let lo = 0;
  let hi = bars.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((bars[mid]?.time ?? Infinity) <= t) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

function spanOfIndex(tf: Timeframe, bars: readonly Candle[], i: number, asOf?: number | null): ParentSpan {
  const open = bars[i]!.time;
  const close = closeOf(tf, open, bars[i + 1]?.time);
  return { tf, open, close, forming: asOf != null && asOf < close, calendar: false };
}

/** Calendar-only span (fallback). Uses the FX anchors from `bucketStart`. */
export function calendarSpan(tf: Timeframe, t: number, asOf?: number | null): ParentSpan {
  const open = bucketStart(tf, t);
  const close = open + TF_SECONDS[tf];
  return { tf, open, close, forming: asOf != null && asOf < close, calendar: true };
}

/** The parent span containing `t`, or null when `t` is in a gap (weekend) between real bars.
 *  Falls back to the calendar only when there are no parent bars at all. */
export function spanAt(tf: Timeframe, parentBars: readonly Candle[], t: number, asOf?: number | null): ParentSpan | null {
  if (parentBars.length === 0) return calendarSpan(tf, t, asOf);
  const i = lastAtOrBefore(parentBars, t);
  if (i < 0) return null;
  const s = spanOfIndex(tf, parentBars, i, asOf);
  return inSpan(t, s.open, s.close) ? s : null;
}

/** Parent spans overlapping [from, to), ascending. Capped by `max` (keeps those nearest `to`). */
export function parentSpans(
  tf: Timeframe, parentBars: readonly Candle[], from: number, to: number, asOf?: number | null, max = Infinity,
): ParentSpan[] {
  if (to <= from) return [];
  if (parentBars.length === 0) {
    const out: ParentSpan[] = [];
    for (let o = bucketStart(tf, from); o < to; o += TF_SECONDS[tf]) out.push(calendarSpan(tf, o, asOf));
    return out.slice(Math.max(0, out.length - max));
  }
  const out: ParentSpan[] = [];
  let i = Math.max(0, lastAtOrBefore(parentBars, from));
  for (; i < parentBars.length; i++) {
    const s = spanOfIndex(tf, parentBars, i, asOf);
    if (s.open >= to) break;
    if (s.close > from) out.push(s);
  }
  return out.slice(Math.max(0, out.length - max));
}

/** Children of `span` actually present. With `asOf`, a child counts only once it has closed (time + childSec <= asOf). */
export function countChildren(span: ParentSpan, childTf: Timeframe, childBars: readonly Candle[], asOf?: number | null): ChildCount {
  const sec = TF_SECONDS[childTf];
  const expected = Math.max(0, Math.round((span.close - span.open) / sec));
  let present = 0;
  for (let i = Math.max(0, lastAtOrBefore(childBars, span.open - 1) + 1); i < childBars.length; i++) {
    const c = childBars[i]!;
    if (c.time >= span.close) break;
    if (asOf != null && c.time + sec > asOf) break;
    present++;
  }
  return { present, expected, partial: present < expected };
}