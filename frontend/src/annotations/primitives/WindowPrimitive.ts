import { BasePrimitive, fillBox, type Coordinates, type Scope } from "./BasePrimitive";
import { clampSpan } from "./coords";
import { shouldDraw } from "./declutter";
import type { BarFeed, CommonOpts } from "./types";

export interface WindowOpts extends CommonOpts {
  start: number;
  end: number;
  color: string;
  /** Default 0.06. */
  fillAlpha?: number;
}

/** Full-height time band, drawn behind the candles. */
export class WindowPrimitive extends BasePrimitive {
  constructor(feed: BarFeed, private o: WindowOpts) {
    super(feed);
    this.zOrder = "bottom";
  }

  set(o: WindowOpts): void {
    this.o = o;
    this.requestUpdate();
  }

  protected render(scope: Scope, c: Coordinates): void {
    const xa = c.timeX(this.o.start);
    const xb = c.timeX(this.o.end);
    if (xa === null || xb === null) return;
    const span = clampSpan(xa, xb, 0, scope.mediaSize.width);
    if (!span || !shouldDraw(this.o.emphasis, span.end - span.start)) return;
    fillBox(scope, span.start, span.end, 0, scope.mediaSize.height, this.o.color, (this.o.fillAlpha ?? 0.06) * (this.o.alpha ?? 1));
  }
}