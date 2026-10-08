import type { ISeriesPrimitiveAxisView } from "lightweight-charts";
import { BasePrimitive, strokeH, type Coordinates, type Scope } from "./BasePrimitive";
import { clampSpan } from "./coords";
import { shouldDraw } from "./declutter";
import type { BarFeed, CommonOpts, LineStyleOpts, TimeOrRight } from "./types";

export interface LevelOpts extends CommonOpts, LineStyleOpts {
  price: number;
  start: number;
  /** Time it was swept, or "right" while it still stands. */
  end: TimeOrRight;
  /** Text for the price-axis label; omit for no axis label. */
  priceText?: string;
  /** Axis label text colour (the chart background token). */
  axisTextColor?: string;
}

/** Horizontal line from `start` to `end` or the right edge. */
export class LevelPrimitive extends BasePrimitive {
  private y: number | null = null;

  constructor(feed: BarFeed, private o: LevelOpts) {
    super(feed);
  }

  set(o: LevelOpts): void {
    this.o = o;
    this.requestUpdate();
  }

  updateAllViews(): void {
    this.y = this.coords?.priceY(this.o.price) ?? null;
  }

  priceAxisViews(): readonly ISeriesPrimitiveAxisView[] {
    const { priceText, color, axisTextColor } = this.o;
    if (!priceText) return [];
    return [
      {
        coordinate: () => this.y ?? 0,
        text: () => priceText,
        textColor: () => axisTextColor ?? "#000",
        backColor: () => color,
        visible: () => this.y !== null,
      },
    ];
  }

  protected render(scope: Scope, c: Coordinates): void {
    const y = c.priceY(this.o.price);
    const xa = c.timeX(this.o.start);
    if (y === null || xa === null) return;
    const paneW = scope.mediaSize.width;
    const xb = this.o.end === "right" ? paneW : c.timeX(this.o.end);
    if (xb === null) return;
    const span = clampSpan(xa, xb, 0, paneW);
    if (!span || !shouldDraw(this.o.emphasis, span.end - span.start)) return;
    strokeH(scope, y, span.start, span.end, { color: this.o.color, lineWidth: this.o.lineWidth, dash: this.o.dash, alpha: this.o.alpha });
  }
}