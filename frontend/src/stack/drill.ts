/** S6: pure drill math. A drill into a candle composes every intermediate level (D > H4 > H1 ...), so "back" pops one level. */
import { TF_SECONDS, type Candle, type Timeframe } from "@/types/market";
import { calendarSpan, spanAt } from "./align";
import { STACK_ORDER, type Focus } from "./viewportPolicy";

export type StackBars = Partial<Record<Timeframe, readonly Candle[]>>;

/** KnownInterval(asOf): a parent still forming at `asOf` is clipped to its known end. */
export function knownInterval(open: number, close: number, asOf?: number | null): { interval: [number, number]; forming: boolean } {
  if (asOf == null || asOf >= close) return { interval: [open, close], forming: false };
  return { interval: [open, Math.max(open + 1, asOf)], forming: true };
}

/** Focus for the `tf` candle containing `t`. Actual parent bars first; calendar only in a gap or with no data. */
export function focusFor(tf: Timeframe, t: number, bars: StackBars, asOf: number | null | undefined, depth: number): Focus {
  const span = spanAt(tf, bars[tf] ?? [], t, asOf) ?? calendarSpan(tf, t, asOf);
  const k = knownInterval(span.open, span.close, asOf);
  return { anchor: t, interval: k.interval, parentTF: tf, drillDepth: depth, ...(k.forming ? { forming: true } : {}) };
}

/** Stack levels that are shown, top-down. `rows` defaults to every stack row; hidden rows are skipped. */
const levelsOf = (rows: readonly Timeframe[]): Timeframe[] => STACK_ORDER.filter((tf) => rows.includes(tf));

/** Foci from the top of the shown rows down to `target`, one per level. Empty when `target` has no shown row (W, or hidden). */
export function drillChain(target: Timeframe, t: number, bars: StackBars, asOf?: number | null, rows: readonly Timeframe[] = STACK_ORDER): Focus[] {
  const levels = levelsOf(rows);
  const end = levels.indexOf(target);
  if (end < 0) return [];
  return levels.slice(0, end + 1).map((tf, i) => focusFor(tf, t, bars, asOf, i));
}

/** A row can be drilled only if a shown row exists below it. */
export const canDrill = (tf: Timeframe, rows: readonly Timeframe[] = STACK_ORDER): boolean => {
  const levels = levelsOf(rows);
  const i = levels.indexOf(tf);
  return i >= 0 && i < levels.length - 1;
};

/** Breadcrumb levels ending at `focus`: contiguous drill depths walking back through history. */
export function breadcrumbTrail(focus: Focus | null, history: readonly Focus[]): Focus[] {
  if (!focus || focus.drillDepth === 0) return [];
  const out: Focus[] = [focus];
  let depth = focus.drillDepth;
  for (let i = history.length - 1; i >= 0 && depth > 0; i--) {
    const h = history[i]!;
    if (h.drillDepth === depth - 1) {
      out.unshift(h);
      depth -= 1;
    }
  }
  return out;
}

export const focusSeconds = (f: Focus): number => f.interval[1] - f.interval[0];
export const nominalSeconds = (f: Focus): number => TF_SECONDS[f.parentTF];