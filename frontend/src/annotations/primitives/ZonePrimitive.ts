import { BasePrimitive, borderBox, fillBox, strokeH, type Coordinates, type Scope } from "./BasePrimitive";
import { clampSpan } from "./coords";
import { shouldDraw } from "./declutter";
import type { BarFeed, CommonOpts, TimeOrRight } from "./types";

export interface ZoneOpts extends CommonOpts {
  start: number;
  end: TimeOrRight;
  top: number;
  bottom: number;
  color: string;
  /** Flat fill, 0 to 0.18. */
  fillAlpha: number;
  /** Hairline border alpha; omit for no border. */
  borderAlpha?: number;
  borderDash?: readonly number[];
  /** Dashed equilibrium line at 50% (premium / discount). */
  midline?: boolean;
}

/** Rectangle between two prices and two times. Flat fill, hairline border, no gradient. */
export class ZonePrimitive extends BasePrimitive {
  constructor(feed: BarFeed, private o: ZoneOpts) {
    super(feed);
    this.zOrder = "bottom";
  }

  set(o: ZoneOpts): void {
    this.o = o;
    this.requestUpdate();
  }

  protected render(scope: Scope, c: Coordinates): void {
    const { start, end, top, bottom, color, fillAlpha, borderAlpha, borderDash, midline, emphasis, alpha = 1 } = this.o;
    const ya = c.priceY(top);
    const yb = c.priceY(bottom);
    const xa = c.timeX(start);
    if (ya === null || yb === null || xa === null) return;
    const paneW = scope.mediaSize.width;
    const xb = end === "right" ? paneW : c.timeX(end);
    if (xb === null) return;
    const span = clampSpan(xa, xb, 0, paneW);
    if (!span || !shouldDraw(emphasis, span.end - span.start)) return;
    const box = fillBox(scope, span.start, span.end, ya, yb, color, fillAlpha * alpha);
    if (borderAlpha !== undefined) borderBox(scope, box, { color, alpha: borderAlpha * alpha, dash: borderDash });
    if (midline) strokeH(scope, (ya + yb) / 2, span.start, span.end, { color, dash: [4, 3], alpha: 0.5 * alpha });
  }
}