/** S3: per-TF ViewportPolicy. Each chart derives its OWN logical range from the shared Focus. Never one shared [from,to]. */
import { TF_SECONDS, type Candle, type Timeframe } from "@/types/market";
import type { StrategyDef } from "@/types/strategy";

export interface ViewportPolicy {
  /** Fewest bars shown. */
  minContext: number;
  /** Most bars shown. */
  maxContext: number;
  /** For TFs below the parent: the fraction of the width the focus interval should fill (0-1). Unused at/above the parent. */
  focusCoverage: number;
}

export const STACK_ORDER: readonly Timeframe[] = ["D", "H4", "H1", "M15", "M5", "M1"];

export const VIEWPORT_POLICY: Record<Timeframe, ViewportPolicy> = {
  W: { minContext: 12, maxContext: 26, focusCoverage: 0.5 },
  D: { minContext: 20, maxContext: 40, focusCoverage: 0.5 },
  H4: { minContext: 20, maxContext: 40, focusCoverage: 0.5 },
  H1: { minContext: 30, maxContext: 80, focusCoverage: 0.5 },
  M15: { minContext: 40, maxContext: 120, focusCoverage: 0.5 },
  M5: { minContext: 60, maxContext: 300, focusCoverage: 0.5 },
  M1: { minContext: 100, maxContext: 300, focusCoverage: 0.5 },
};

/** DX1: density class of one stack row. */
export type RowClass = "focus" | "detail" | "context" | "collapsed" | "hidden";

/** Fixed height of a collapsed (unsupported) row. */
export const COLLAPSED_ROW_PX = 28;
export const MIN_FOCUS_ROW_PX = 120;
export const MIN_ROW_PX = 56;
export const FOCUS_WEIGHT = 2;
export const DETAIL_WEIGHT = 1.5;
export const CONTEXT_WEIGHT = 0.8;
export const DAILY_CONTEXT_WEIGHT = 0.7;

export function rowWeight(tf: Timeframe, cls: RowClass): number {
  if (cls === "focus") return FOCUS_WEIGHT;
  if (cls === "detail") return DETAIL_WEIGHT;
  if (cls === "context") return tf === "D" ? DAILY_CONTEXT_WEIGHT : CONTEXT_WEIGHT;
  return 0;
}

export function rowMin(cls: RowClass): number {
  if (cls === "focus") return MIN_FOCUS_ROW_PX;
  if (cls === "collapsed") return COLLAPSED_ROW_PX;
  if (cls === "hidden") return 0;
  return MIN_ROW_PX;
}

export interface RowInput {
  /** The active setup's TF, else the last interacted row. */
  focusTF: Timeframe | null;
  /** TFs the strategy supports. Null/undefined = all supported. */
  supported?: ReadonlySet<Timeframe> | null;
  /** TFs the user hid. */
  hidden?: ReadonlySet<Timeframe> | null;
}

/** hidden > collapsed > focus > detail (below the focus TF) > context (above it). */
export function rowClass(tf: Timeframe, input: RowInput): RowClass {
  if (input.hidden?.has(tf)) return "hidden";
  if (input.supported && !input.supported.has(tf)) return "collapsed";
  const f = input.focusTF;
  if (f === null) return "detail";
  if (tf === f) return "focus";
  return TF_SECONDS[tf] < TF_SECONDS[f] ? "detail" : "context";
}

/** The focus row must be a visible, supported row: the requested TF, else the nearest one (ties go to the lower TF). Null when none. */
export function resolveFocusTF(focusTF: Timeframe | null, input: Omit<RowInput, "focusTF">): Timeframe | null {
  const ok = STACK_ORDER.filter((tf) => !input.hidden?.has(tf) && (!input.supported || input.supported.has(tf)));
  if (ok.length === 0) return null;
  const want = focusTF ?? "M15";
  if (ok.includes(want)) return want;
  const dist = (tf: Timeframe) => Math.abs(Math.log(TF_SECONDS[tf] / TF_SECONDS[want]));
  return [...ok].sort((a, b) => dist(a) - dist(b) || TF_SECONDS[a] - TF_SECONDS[b])[0] ?? null;
}

/** Classes for every stack row (W has no row: hidden). */
export function stackRowClasses(input: RowInput): Record<Timeframe, RowClass> {
  const focusTF = resolveFocusTF(input.focusTF, input);
  const out = { W: "hidden" } as Record<Timeframe, RowClass>;
  for (const tf of STACK_ORDER) out[tf] = rowClass(tf, { ...input, focusTF });
  return out;
}

/** DX1/5.7: what the row picker needs from a strategy. */
export type RowStrategy = Pick<StrategyDef, "supported_timeframes" | "context_timeframes">;

export const supportedRows = (strategy: RowStrategy | null | undefined): ReadonlySet<Timeframe> | null =>
  strategy ? new Set(strategy.supported_timeframes) : null;

/** Rows to show, top-down. Default = supported + context TFs; a user override (visible set) wins. At least one row always stays. */
export function visibleRows(strategy: RowStrategy | null | undefined, override?: ReadonlySet<Timeframe> | null): Timeframe[] {
  const base = strategy ? new Set<Timeframe>([...strategy.supported_timeframes, ...strategy.context_timeframes]) : null;
  const dflt = STACK_ORDER.filter((tf) => !base || base.has(tf));
  const fallback = dflt.length > 0 ? dflt : [...STACK_ORDER];
  if (!override) return fallback;
  const picked = STACK_ORDER.filter((tf) => override.has(tf));
  return picked.length > 0 ? picked : fallback;
}

export function hiddenRows(strategy: RowStrategy | null | undefined, override?: ReadonlySet<Timeframe> | null): ReadonlySet<Timeframe> {
  const vis = new Set(visibleRows(strategy, override));
  return new Set(STACK_ORDER.filter((tf) => !vis.has(tf)));
}

/** The one global Focus. `interval` is half-open [open, close) in UTC seconds. */
export interface Focus {
  anchor: number;
  interval: readonly [number, number];
  parentTF: Timeframe;
  drillDepth: number;
  /** S6: the parent is still forming at `asOf`; `interval[1]` is clipped to the known end. */
  forming?: boolean;
}

export interface Viewport {
  /** Logical bar indexes (may run past the data on either side). */
  from: number;
  to: number;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Number of bars `tf` should show for this focus. */
export function barsToShow(tf: Timeframe, focus: Focus): number {
  const p = VIEWPORT_POLICY[tf];
  const parentSec = TF_SECONDS[focus.parentTF];
  if (TF_SECONDS[tf] >= parentSec) return Math.round((p.minContext + p.maxContext) / 2);
  const span = Math.max(1, focus.interval[1] - focus.interval[0]);
  const focusBars = span / TF_SECONDS[tf];
  return clamp(Math.round(focusBars / Math.max(0.05, p.focusCoverage)), p.minContext, p.maxContext);
}

/** Index of the first bar at or after `t`, clamped to the last bar. Bars ascending. */
function indexAtOrAfter(bars: readonly Candle[], t: number): number {
  let lo = 0;
  let hi = bars.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((bars[mid]?.time ?? Infinity) < t) lo = mid + 1;
    else hi = mid;
  }
  return Math.min(lo, Math.max(0, bars.length - 1));
}

/** Logical range for one chart, centred on the focus midpoint. Null when there is no data. */
export function deriveViewport(tf: Timeframe, focus: Focus, bars: readonly Candle[]): Viewport | null {
  if (bars.length === 0) return null;
  const n = barsToShow(tf, focus);
  const mid = (focus.interval[0] + focus.interval[1]) / 2;
  const centre = indexAtOrAfter(bars, mid);
  const half = n / 2;
  return { from: centre - half, to: centre + half };
}