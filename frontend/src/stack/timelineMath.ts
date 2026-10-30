/** Timeline Sync: pure math. All rows share ONE time window [anchor, anchor + span); each row maps it to its own logical range. */
import { timeToLogical } from "@/annotations/primitives/coords";
import type { DataBounds } from "@/scan/dateRange";
import type { Candle } from "@/types/market";

export const STEP_SEC = 60;
export const MIN_SPAN = 600;
export const MAX_SPAN = 5 * 86400;
export const DEFAULT_SPAN = 3 * 3600;
/** A row is never asked to show less than this many bars (H4 cannot show 3h of data meaningfully). */
export const MIN_LOGICAL_WIDTH = 2;

export interface LogicalRange {
  from: number;
  to: number;
}

export const clampSpan = (s: number): number => Math.min(MAX_SPAN, Math.max(MIN_SPAN, Math.round(s)));

/** Inverse of `timeToLogical`. Null when there are no bars. */
export function logicalToTime(l: number, bars: readonly { time: number }[], sec: number): number | null {
  const n = bars.length;
  if (n === 0 || sec <= 0) return null;
  if (l < 0) return (bars[0]?.time ?? 0) + l * sec;
  if (l >= n - 1) return (bars[n - 1]?.time ?? 0) + (l - (n - 1)) * sec;
  const i = Math.floor(l);
  return (bars[i]?.time ?? 0) + (l - i) * sec;
}

/** The row's logical range for the shared window, with the left edge exactly at `anchor`. */
export function rangeFor(bars: readonly { time: number }[], sec: number, anchor: number, span: number): LogicalRange | null {
  const from = timeToLogical(anchor, bars, sec);
  const to = timeToLogical(anchor + span, bars, sec);
  if (from === null || to === null) return null;
  return { from, to: Math.max(to, from + MIN_LOGICAL_WIDTH) };
}

/** The time width a user-zoomed row now shows, or null when it is too narrow to trust (floored rows such as H4). */
export function spanFromRange(r: LogicalRange, bars: readonly { time: number }[], sec: number): number | null {
  if (r.to - r.from <= MIN_LOGICAL_WIDTH + 0.5) return null;
  const a = logicalToTime(r.from, bars, sec);
  const b = logicalToTime(r.to, bars, sec);
  if (a === null || b === null || b <= a) return null;
  return clampSpan(b - a);
}

/** Slider range in whole minutes: dataset bounds (else loaded M1), capped at `asOf`. Null when unknown. */
export function sliderBounds(m1: readonly Candle[], bounds: DataBounds | null, asOf: number | null): { min: number; max: number } | null {
  const first = bounds?.first ?? m1[0]?.time ?? null;
  const lastRaw = bounds?.last ?? m1[m1.length - 1]?.time ?? null;
  if (first === null || lastRaw === null) return null;
  const last = asOf !== null ? Math.min(lastRaw, asOf) : lastRaw;
  const min = Math.ceil(first / STEP_SEC) * STEP_SEC;
  const max = Math.floor(last / STEP_SEC) * STEP_SEC;
  return max > min ? { min, max } : null;
}

export function formatSpan(sec: number): string {
  if (sec >= 86400) return `${Math.round((sec / 86400) * 10) / 10}d`;
  if (sec >= 3600) return `${Math.round((sec / 3600) * 10) / 10}h`;
  return `${Math.round(sec / 60)}m`;
}