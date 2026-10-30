import { PANEL_ORDER, type Timeframe } from "@/types/market";
import {
  COLLAPSED_ROW_PX,
  rowMin,
  rowWeight,
  STACK_ORDER,
  stackRowClasses,
  type RowClass,
} from "@/stack/viewportPolicy";
import { FOCUS_BREAKPOINT_PX } from "./panelConfig";

export type Layout = "grid" | "focus" | "maximized" | "stack";
export interface Size { width: number; height: number }
export interface Rect { x: number; y: number; width: number; height: number }
export type Rects = Record<Timeframe, Rect | null>;

export const GAP = 1;
/** Height reserved at the top of the stack for the focus bar. */
export const STACK_BAR_PX = 26;
/** Height reserved at the bottom of the stack for the Timeline Sync slider. */
export const STACK_TIMELINE_PX = 36;
/** DX9: Overview strip above the focus bar. Reserved only while it is shown. */
export const STACK_OVERVIEW_PX = 24;
const FOCUS_SMALL_FRACTION = 0.24;

/** Focus under about 1280 px, Grid above. */
export function defaultLayoutForWidth(width: number): Exclude<Layout, "maximized"> {
  return width < FOCUS_BREAKPOINT_PX ? "focus" : "grid";
}

/** DX1: inputs that shape the stack rows. Omitted = every row supported and visible, focus = the focused panel. */
export interface StackRowsInput {
  focusTF?: Timeframe | null;
  supported?: ReadonlySet<Timeframe> | null;
  hidden?: ReadonlySet<Timeframe> | null;
  /** DX9: the Overview strip is shown, so the rows start `STACK_OVERVIEW_PX` lower. */
  overview?: boolean;
}

/** Height reserved above the rows: the focus bar, plus the Overview strip when shown. */
export function stackTopPx(height: number, overview?: boolean): number {
  return Math.min(STACK_BAR_PX + (overview ? STACK_OVERVIEW_PX : 0), height);
}

export interface PlannedRow {
  tf: Timeframe;
  cls: RowClass;
  height: number;
  /** A supported row squeezed to the collapsed height because the viewport is short. */
  demoted: boolean;
}

/** Splits `total` by weight; rows under their minimum are pinned to it and the rest re-split. The last row takes the remainder. */
function distribute(total: number, items: readonly { w: number; min: number }[]): number[] {
  const out = items.map(() => 0);
  if (items.length === 0) return out;
  const minsFit = total >= items.reduce((s, i) => s + i.min, 0);
  const fixed = items.map(() => false);
  let remaining = total;
  for (;;) {
    const active = items.map((_, i) => i).filter((i) => !fixed[i]);
    if (active.length === 0) return out;
    const sumW = active.reduce((s, i) => s + items[i]!.w, 0) || 1;
    const low = minsFit ? active.filter((i) => (remaining * items[i]!.w) / sumW < items[i]!.min) : [];
    if (low.length === 0) {
      let used = 0;
      active.forEach((i, k) => {
        const h = k === active.length - 1 ? remaining - used : Math.floor((remaining * items[i]!.w) / sumW);
        out[i] = Math.max(0, h);
        used += out[i]!;
      });
      return out;
    }
    for (const i of low) {
      out[i] = items[i]!.min;
      fixed[i] = true;
      remaining -= items[i]!.min;
    }
  }
}

/**
 * Stack rows top-down. Collapsed rows take fixed pixels first, the rest split by weight with minimums.
 * A short viewport demotes context rows to the collapsed height first (farthest from the focus), then detail rows.
 */
export function planStackRows(avail: number, input: StackRowsInput & { focusTF: Timeframe | null }): PlannedRow[] {
  const classes = stackRowClasses({ focusTF: input.focusTF, supported: input.supported, hidden: input.hidden });
  const rows: PlannedRow[] = STACK_ORDER.filter((tf) => classes[tf] !== "hidden").map((tf) => ({
    tf,
    cls: classes[tf],
    height: 0,
    demoted: false,
  }));
  if (rows.length === 0) return rows;

  const room = Math.max(0, avail - GAP * (rows.length - 1));
  const need = () => rows.reduce((s, r) => s + rowMin(r.cls), 0);
  const focusIdx = STACK_ORDER.indexOf(rows.find((r) => r.cls === "focus")?.tf ?? "M15");
  for (const demote of ["context", "detail"] as const) {
    const far = rows
      .filter((r) => r.cls === demote)
      .sort((a, b) => Math.abs(STACK_ORDER.indexOf(b.tf) - focusIdx) - Math.abs(STACK_ORDER.indexOf(a.tf) - focusIdx));
    for (const r of far) {
      if (need() <= room) break;
      r.cls = "collapsed";
      r.demoted = true;
    }
  }

  const flex = rows.filter((r) => r.cls !== "collapsed");
  if (flex.length === 0) {
    const each = Math.min(COLLAPSED_ROW_PX, Math.floor(room / rows.length));
    rows.forEach((r) => (r.height = each));
    return rows;
  }
  const collapsed = rows.length - flex.length;
  const flexRoom = Math.max(0, room - collapsed * COLLAPSED_ROW_PX);
  const heights = distribute(
    flexRoom,
    flex.map((r) => ({ w: rowWeight(r.tf, r.cls), min: rowMin(r.cls) })),
  );
  flex.forEach((r, i) => (r.height = heights[i] ?? 0));
  rows.forEach((r) => {
    if (r.cls === "collapsed") r.height = COLLAPSED_ROW_PX;
  });
  return rows;
}

/** The stack rows for a stage size: what `computeRects` lays out, with each row's class and demotion. */
export function stackPlan(size: Size, focused: Timeframe, rows?: StackRowsInput): PlannedRow[] {
  const bar = stackTopPx(size.height, rows?.overview);
  const bottom = Math.min(STACK_TIMELINE_PX, Math.max(0, size.height - bar));
  const focusTF = rows?.focusTF !== undefined ? rows.focusTF : STACK_ORDER.includes(focused) ? focused : null;
  return planStackRows(Math.max(0, size.height - bar - bottom), { focusTF, supported: rows?.supported, hidden: rows?.hidden });
}

/** Split `total` into `n` parts separated by `GAP`; the last part takes the remainder. */
function split(total: number, n: number): number[] {
  const each = Math.max(0, Math.floor((total - GAP * (n - 1)) / n));
  const parts = Array.from({ length: n }, () => each);
  parts[n - 1] = Math.max(0, total - GAP * (n - 1) - each * (n - 1));
  return parts;
}

function row(order: readonly Timeframe[], y: number, height: number, width: number, out: Rects): void {
  const widths = split(width, order.length);
  let x = 0;
  order.forEach((tf, i) => {
    const w = widths[i] ?? 0;
    out[tf] = { x, y, width: w, height };
    x += w + GAP;
  });
}

export function computeRects(layout: Layout, size: Size, focused: Timeframe, rows?: StackRowsInput): Rects {
  const { width, height } = size;
  const out: Rects = { W: null, D: null, H4: null, H1: null, M15: null, M5: null, M1: null };

  if (layout === "maximized") {
    out[focused] = { x: 0, y: 0, width, height };
    return out;
  }

  if (layout === "stack") {
    // one vertical column D, H4, H1, M15, M5, M1 between a focus bar and the timeline slider; W has no row
    const bar = stackTopPx(height, rows?.overview);
    const plan = stackPlan(size, focused, rows);
    let y = bar;
    plan.forEach((p) => {
      out[p.tf] = { x: 0, y, width, height: p.height };
      y += p.height + GAP;
    });
    return out;
  }

  if (layout === "grid") {
    const [top = 0, bottom = 0] = split(height, 2);
    row(PANEL_ORDER.slice(0, 3), 0, top, width, out);
    row(PANEL_ORDER.slice(3), top + GAP, bottom, width, out);
    return out;
  }

  // focus: one large chart on the left, the other four stacked on the right
  const smallW = Math.round(width * FOCUS_SMALL_FRACTION);
  const bigW = Math.max(0, width - GAP - smallW);
  out[focused] = { x: 0, y: 0, width: bigW, height };
  const heights = split(height, 4);
  let y = 0;
  PANEL_ORDER.filter((tf) => tf !== focused).forEach((tf, i) => {
    const h = heights[i] ?? 0;
    out[tf] = { x: bigW + GAP, y, width: smallW, height: h };
    y += h + GAP;
  });
  return out;
}