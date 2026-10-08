import { BasePrimitive, fillPath, type Coordinates, type Scope } from "./BasePrimitive";
import type { LinePoint } from "./LinePrimitive";
import type { BarFeed, CommonOpts } from "./types";

export interface BandFillOpts extends CommonOpts {
  /** Upper edge, left→right. */
  upper: readonly LinePoint[];
  /** Lower edge, left→right (reversed internally to close the polygon). */
  lower: readonly LinePoint[];
  color: string;
  /** 0 to ~0.2. */
  fillAlpha: number;
}

/** Translucent region between a band's upper and lower edges (Bollinger/Keltner/Donchian). */
export class BandFillPrimitive extends BasePrimitive {
  constructor(feed: BarFeed, private o: BandFillOpts) {
    super(feed);
    this.zOrder = "bottom";
  }

  set(o: BandFillOpts): void {
    this.o = o;
    this.requestUpdate();
  }

  protected render(scope: Scope, c: Coordinates): void {
    const { upper, lower, color, fillAlpha, alpha = 1 } = this.o;
    const top = this.project(upper, c);
    const bottom = this.project(lower, c);
    if (top.length < 2 || bottom.length < 2) return;
    fillPath(scope, [...top, ...bottom.reverse()], color, fillAlpha * alpha);
  }

  private project(points: readonly LinePoint[], c: Coordinates): { x: number; y: number }[] {
    const out: { x: number; y: number }[] = [];
    for (const p of points) {
      const x = c.timeX(p.time);
      const y = c.priceY(p.price);
      if (x !== null && y !== null) out.push({ x, y });
    }
    return out;
  }
}
