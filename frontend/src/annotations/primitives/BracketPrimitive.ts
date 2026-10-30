import { BasePrimitive, drawLabel, fillBox, strokePath, textWidth, type Coordinates, type Scope } from "./BasePrimitive";
import { clampSpan } from "./coords";
import type { BarFeed } from "./types";

export interface BracketMark {
  open: number;
  close: number;
  forming: boolean;
  active: boolean;
  partial: boolean;
  label: string;
}

export interface BracketOpts {
  marks: readonly BracketMark[];
  /** Resolved CSS colours. */
  line: string;
  active: string;
  text: string;
  halo: string;
  font: string;
}

/** S4: parent-candle verticals, active-parent shading and the `×N` badge on a lower row. */
export class BracketPrimitive extends BasePrimitive {
  constructor(feed: BarFeed, private o: BracketOpts) {
    super(feed);
  }

  set(o: BracketOpts): void {
    this.o = o;
    this.requestUpdate();
  }

  protected render(scope: Scope, c: Coordinates): void {
    const w = scope.mediaSize.width;
    const h = scope.mediaSize.height;
    for (const m of this.o.marks) {
      const xa = c.timeX(m.open);
      const xb = c.timeX(m.close);
      if (xa === null || xb === null) continue;
      const span = clampSpan(xa, xb, 0, w);
      if (!span) continue;
      if (m.active) fillBox(scope, span.start, span.end, 0, h, this.o.active, 0.1);
      if (xa >= 0 && xa <= w) strokePath(scope, [{ x: xa, y: 0 }, { x: xa, y: h }], { color: this.o.line, lineWidth: 1, alpha: 0.5 });
      if (m.forming && xb >= 0 && xb <= w) {
        strokePath(scope, [{ x: xb, y: 0 }, { x: xb, y: h }], { color: this.o.line, lineWidth: 1, dash: [3, 3], alpha: 0.7 });
      }
      const style = { color: this.o.text, halo: this.o.halo, font: this.o.font, size: 11, alpha: m.partial ? 0.45 : 0.85 };
      const left = Math.max(xa, 0) + 4;
      if (Math.min(xb, w) - left < textWidth(scope, m.label, style) + 4) continue;
      drawLabel(scope, m.label, left, 3, style);
    }
  }
}