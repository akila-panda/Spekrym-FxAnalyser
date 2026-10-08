import { BasePrimitive, strokePath, type Coordinates, type Scope } from "./BasePrimitive";
import type { BarFeed, CommonOpts, LineStyleOpts } from "./types";

export interface LinePoint {
  time: number;
  price: number;
}
export interface LineOpts extends CommonOpts, LineStyleOpts {
  /** Two points = a segment; more = a polyline (VWAP and similar). */
  points: readonly LinePoint[];
}

export class LinePrimitive extends BasePrimitive {
  constructor(feed: BarFeed, private o: LineOpts) {
    super(feed);
  }

  set(o: LineOpts): void {
    this.o = o;
    this.requestUpdate();
  }

  protected render(scope: Scope, c: Coordinates): void {
    const pts: { x: number; y: number }[] = [];
    for (const p of this.o.points) {
      const x = c.timeX(p.time);
      const y = c.priceY(p.price);
      if (x !== null && y !== null) pts.push({ x, y });
    }
    // skip a line entirely off to one side
    const w = scope.mediaSize.width;
    if (pts.length < 2 || pts.every((p) => p.x < 0) || pts.every((p) => p.x > w)) return;
    strokePath(scope, pts, { color: this.o.color, lineWidth: this.o.lineWidth, dash: this.o.dash, alpha: this.o.alpha });
  }
}