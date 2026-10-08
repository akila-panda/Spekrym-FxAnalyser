import { PANEL_ORDER, type Timeframe } from "@/types/market";
import { FOCUS_BREAKPOINT_PX } from "./panelConfig";

export type Layout = "grid" | "focus" | "maximized";
export interface Size { width: number; height: number }
export interface Rect { x: number; y: number; width: number; height: number }
export type Rects = Record<Timeframe, Rect | null>;

export const GAP = 1;
const FOCUS_SMALL_FRACTION = 0.24;

/** Focus under about 1280 px, Grid above. */
export function defaultLayoutForWidth(width: number): Exclude<Layout, "maximized"> {
  return width < FOCUS_BREAKPOINT_PX ? "focus" : "grid";
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

export function computeRects(layout: Layout, size: Size, focused: Timeframe): Rects {
  const { width, height } = size;
  const out: Rects = { H4: null, H1: null, M15: null, M5: null, M1: null };

  if (layout === "maximized") {
    out[focused] = { x: 0, y: 0, width, height };
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