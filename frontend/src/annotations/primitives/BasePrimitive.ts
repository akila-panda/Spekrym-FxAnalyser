import type {
  IChartApi, IPrimitivePaneRenderer, IPrimitivePaneView, ISeriesApi, ISeriesPrimitive,
  ISeriesPrimitiveAxisView, PrimitivePaneViewZOrder, SeriesAttachedParameter, SeriesType, Time,
} from "lightweight-charts";
import { makeCoordinates } from "./coords";
import type { BarFeed, Coordinates } from "./types";

type Target = Parameters<IPrimitivePaneRenderer["draw"]>[0];
export type Scope = Parameters<Parameters<Target["useBitmapCoordinateSpace"]>[0]>[0];

export type { Coordinates };

/** Attach, detach, redraw requests and bitmap-space rendering. Subclasses implement `render`. */
export abstract class BasePrimitive implements ISeriesPrimitive<Time> {
  protected chart: IChartApi | null = null;
  protected series: ISeriesApi<SeriesType> | null = null;
  protected coords: Coordinates | null = null;
  private redraw: (() => void) | null = null;
  protected zOrder: PrimitivePaneViewZOrder = "normal";

  constructor(protected readonly feed: BarFeed) {}

  attached(p: SeriesAttachedParameter<Time>): void {
    this.chart = p.chart;
    this.series = p.series;
    this.redraw = p.requestUpdate;
    this.coords = makeCoordinates(p.chart.timeScale(), p.series, this.feed.getBars, this.feed.barSeconds);
  }

  detached(): void {
    this.chart = null;
    this.series = null;
    this.coords = null;
    this.redraw = null;
  }

  requestUpdate(): void {
    this.redraw?.();
  }

  /** Recompute anything that depends on chart state. Called by the chart before every paint. */
  updateAllViews(): void {}

  paneViews(): readonly IPrimitivePaneView[] {
    return [
      {
        zOrder: () => this.zOrder,
        renderer: () => ({
          draw: (target) => {
            target.useBitmapCoordinateSpace((scope) => {
              const c = this.coords;
              if (!c) return;
              const { context: ctx, bitmapSize } = scope;
              ctx.save();
              ctx.beginPath();
              ctx.rect(0, 0, bitmapSize.width, bitmapSize.height); // clip to the pane
              ctx.clip();
              this.render(scope, c);
              ctx.restore();
            });
          },
        }),
      },
    ];
  }

  priceAxisViews(): readonly ISeriesPrimitiveAxisView[] {
    return [];
  }

  protected abstract render(scope: Scope, c: Coordinates): void;
}

// ---------- bitmap-space drawing helpers ----------

/** Snap a bitmap coordinate so a line of `widthPx` device pixels is crisp. */
export const crisp = (v: number, widthPx: number): number => (widthPx % 2 === 1 ? Math.floor(v) + 0.5 : Math.round(v));
export const devWidth = (css: number, ratio: number): number => Math.max(1, Math.round(css * ratio));

export interface StrokeOpts {
  color: string;
  lineWidth?: number;
  dash?: readonly number[];
  alpha?: number;
}

function applyStroke(scope: Scope, o: StrokeOpts): number {
  const { context: ctx, horizontalPixelRatio: hpr, verticalPixelRatio: vpr } = scope;
  const w = devWidth(o.lineWidth ?? 1, Math.min(hpr, vpr));
  ctx.strokeStyle = o.color;
  ctx.lineWidth = w;
  ctx.globalAlpha = o.alpha ?? 1;
  ctx.setLineDash(o.dash ? o.dash.map((d) => d * hpr) : []);
  return w;
}

/** Horizontal line between CSS-pixel x values at CSS-pixel y. */
export function strokeH(scope: Scope, y: number, xa: number, xb: number, o: StrokeOpts): void {
  const { context: ctx, horizontalPixelRatio: hpr, verticalPixelRatio: vpr } = scope;
  const w = applyStroke(scope, o);
  const yy = crisp(y * vpr, w);
  ctx.beginPath();
  ctx.moveTo(Math.round(xa * hpr), yy);
  ctx.lineTo(Math.round(xb * hpr), yy);
  ctx.stroke();
}

export function strokePath(scope: Scope, pts: readonly { x: number; y: number }[], o: StrokeOpts): void {
  if (pts.length < 2) return;
  const { context: ctx, horizontalPixelRatio: hpr, verticalPixelRatio: vpr } = scope;
  const w = applyStroke(scope, o);
  ctx.lineJoin = "round";
  ctx.beginPath();
  pts.forEach((p, i) => {
    const x = crisp(p.x * hpr, w);
    const y = crisp(p.y * vpr, w);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

/** Filled closed polygon through CSS-pixel points (e.g. the region between two band edges). */
export function fillPath(scope: Scope, pts: readonly { x: number; y: number }[], color: string, alpha: number): void {
  if (pts.length < 3) return;
  const { context: ctx, horizontalPixelRatio: hpr, verticalPixelRatio: vpr } = scope;
  ctx.beginPath();
  pts.forEach((p, i) => {
    const x = p.x * hpr;
    const y = p.y * vpr;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fill();
  ctx.globalAlpha = 1;
}

/** Filled rectangle between CSS-pixel edges; returns the device-pixel rect. */
export function fillBox(
  scope: Scope, xa: number, xb: number, ya: number, yb: number, color: string, alpha: number,
): { x: number; y: number; w: number; h: number } {
  const { context: ctx, horizontalPixelRatio: hpr, verticalPixelRatio: vpr } = scope;
  const x0 = Math.round(Math.min(xa, xb) * hpr);
  const x1 = Math.round(Math.max(xa, xb) * hpr);
  const y0 = Math.round(Math.min(ya, yb) * vpr);
  const y1 = Math.round(Math.max(ya, yb) * vpr);
  const box = { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(box.x, box.y, box.w, box.h);
  ctx.globalAlpha = 1;
  return box;
}

/** 1px border just inside a device-pixel rect. */
export function borderBox(scope: Scope, b: { x: number; y: number; w: number; h: number }, o: StrokeOpts): void {
  const { context: ctx } = scope;
  const w = applyStroke(scope, o);
  const half = w / 2;
  ctx.strokeRect(b.x + half, b.y + half, Math.max(0, b.w - w), Math.max(0, b.h - w));
  ctx.globalAlpha = 1;
}

export interface LabelStyle {
  color: string;
  halo: string;
  font: string;
  /** CSS px. */
  size?: number;
  alpha?: number;
}

/** Text with a halo in the background colour. `x`, `y` are CSS px; `y` is the top of the text box. */
export function drawLabel(scope: Scope, text: string, x: number, y: number, s: LabelStyle, align: CanvasTextAlign = "left"): void {
  const { context: ctx, horizontalPixelRatio: hpr, verticalPixelRatio: vpr } = scope;
  const size = s.size ?? 11;
  ctx.font = `${size * vpr}px ${s.font}`;
  ctx.textAlign = align;
  ctx.textBaseline = "top";
  ctx.globalAlpha = s.alpha ?? 1;
  ctx.lineJoin = "round";
  ctx.lineWidth = 3 * vpr;
  ctx.strokeStyle = s.halo;
  ctx.strokeText(text, Math.round(x * hpr), Math.round(y * vpr));
  ctx.fillStyle = s.color;
  ctx.fillText(text, Math.round(x * hpr), Math.round(y * vpr));
  ctx.globalAlpha = 1;
}

export function textWidth(scope: Scope, text: string, s: Pick<LabelStyle, "font" | "size">): number {
  const { context: ctx, horizontalPixelRatio: hpr, verticalPixelRatio: vpr } = scope;
  ctx.font = `${(s.size ?? 11) * vpr}px ${s.font}`;
  return ctx.measureText(text).width / hpr;
}