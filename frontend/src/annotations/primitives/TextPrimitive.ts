import { BasePrimitive, drawLabel, textWidth, type Coordinates, type LabelStyle, type Scope } from "./BasePrimitive";
import { nudgeLabels } from "./declutter";
import type { BarFeed, CommonOpts } from "./types";

export interface TextItem {
  time: number;
  price: number;
  text: string;
  /** Where the label sits relative to the anchor. */
  anchor?: "above" | "below" | "right";
}
export interface TextOpts extends CommonOpts {
  items: readonly TextItem[];
  style: LabelStyle;
}

const LABEL_H = 14;

/** Anchored labels. Overlapping labels are nudged apart vertically; earlier items keep their place. */
export class TextPrimitive extends BasePrimitive {
  constructor(feed: BarFeed, private o: TextOpts) {
    super(feed);
    this.zOrder = "top";
  }

  set(o: TextOpts): void {
    this.o = o;
    this.requestUpdate();
  }

  protected render(scope: Scope, c: Coordinates): void {
    const { items, style, alpha = 1 } = this.o;
    const paneW = scope.mediaSize.width;
    const placed = items.flatMap((it) => {
      const x = c.timeX(it.time);
      const y = c.priceY(it.price);
      if (x === null || y === null) return [];
      const w = textWidth(scope, it.text, style);
      if (x + w < 0 || x > paneW) return [];
      const top = it.anchor === "below" ? y + 4 : it.anchor === "right" ? y - LABEL_H / 2 : y - LABEL_H - 4;
      return [{ it, x: it.anchor === "right" ? x + 6 : x, top }];
    });
    const ys = nudgeLabels(placed.map((p) => ({ y: p.top, h: LABEL_H })), scope.mediaSize.height);
    placed.forEach((p, i) => {
      drawLabel(scope, p.it.text, p.x, ys[i] ?? p.top, { ...style, alpha }, p.it.anchor === "right" ? "left" : "center");
    });
  }
}