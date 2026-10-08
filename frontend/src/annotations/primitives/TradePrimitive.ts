import { BasePrimitive, drawLabel, fillBox, strokeH, type Coordinates, type LabelStyle, type Scope } from "./BasePrimitive";
import { clampSpan } from "./coords";
import { shouldDraw } from "./declutter";
import type { BarFeed, CommonOpts, TimeOrRight } from "./types";

export interface TradeOpts extends CommonOpts {
  start: number;
  /** Exit time, or "right" while open. */
  end: TimeOrRight;
  entry: number;
  stop: number;
  target: number;
  entryColor: string;
  stopColor: string;
  targetColor: string;
  /** Tints the band that matches the result a little stronger. */
  outcome?: "win" | "loss" | "open";
  /** Text at the right edge, e.g. "+2.1R". */
  label?: string;
  labelStyle?: LabelStyle;
}

/** Entry-to-exit box: entry line solid, stop and target dashed, bands at 10%. */
export class TradePrimitive extends BasePrimitive {
  constructor(feed: BarFeed, private o: TradeOpts) {
    super(feed);
  }

  set(o: TradeOpts): void {
    this.o = o;
    this.requestUpdate();
  }

  protected render(scope: Scope, c: Coordinates): void {
    const o = this.o;
    const yE = c.priceY(o.entry);
    const yS = c.priceY(o.stop);
    const yT = c.priceY(o.target);
    const xa = c.timeX(o.start);
    if (yE === null || yS === null || yT === null || xa === null) return;
    const paneW = scope.mediaSize.width;
    const xb = o.end === "right" ? paneW : c.timeX(o.end);
    if (xb === null) return;
    const span = clampSpan(xa, xb, 0, paneW);
    if (!span || !shouldDraw(o.emphasis, span.end - span.start)) return;
    const a = o.alpha ?? 1;
    fillBox(scope, span.start, span.end, yE, yT, o.targetColor, (o.outcome === "win" ? 0.16 : 0.1) * a);
    fillBox(scope, span.start, span.end, yE, yS, o.stopColor, (o.outcome === "loss" ? 0.16 : 0.1) * a);
    strokeH(scope, yT, span.start, span.end, { color: o.targetColor, dash: [4, 3], alpha: a });
    strokeH(scope, yS, span.start, span.end, { color: o.stopColor, dash: [4, 3], alpha: a });
    strokeH(scope, yE, span.start, span.end, { color: o.entryColor, lineWidth: 1.5, alpha: a });
    if (o.label && o.labelStyle) {
      const top = Math.min(yS, yT);
      const y = top - 14 < 0 ? Math.max(yS, yT) + 2 : top - 14;
      drawLabel(scope, o.label, span.end - 4, y, { ...o.labelStyle, alpha: a }, "right");
    }
  }
}