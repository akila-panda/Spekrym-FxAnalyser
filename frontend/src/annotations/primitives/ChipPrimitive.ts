import { assignLanes } from "@/stack/evidenceChips";
import { BasePrimitive, strokePath, type Coordinates, type Scope } from "./BasePrimitive";
import type { BarFeed } from "./types";

export interface ChipMark {
  n: number;
  /** Bar open time the chip sits on. */
  time: number;
}

export interface ChipOpts {
  chips: readonly ChipMark[];
  highlight: number | null;
  /** Resolved CSS colours. */
  accent: string;
  text: string;
  bg: string;
  line: string;
  font: string;
}

const R = 8;
const TOP = 6;
const MIN_GAP = 2 * R + 2;

/** DX4: numbered evidence chips along the top of a row. Hover linking is a static outline, never an animation. */
export class ChipPrimitive extends BasePrimitive {
  private pos: { n: number; x: number; y: number }[] = [];

  constructor(feed: BarFeed, private o: ChipOpts) {
    super(feed);
  }

  set(o: ChipOpts): void {
    this.o = o;
    this.requestUpdate();
  }

  /** Step number of the chip under a CSS-pixel point, or null. */
  hit(x: number, y: number): number | null {
    for (let i = this.pos.length - 1; i >= 0; i--) {
      const p = this.pos[i]!;
      if ((x - p.x) ** 2 + (y - p.y) ** 2 <= (R + 2) ** 2) return p.n;
    }
    return null;
  }

  protected render(scope: Scope, c: Coordinates): void {
    const { context: ctx, horizontalPixelRatio: hpr, verticalPixelRatio: vpr } = scope;
    const h = scope.mediaSize.height;
    const w = scope.mediaSize.width;
    const placed: { n: number; x: number }[] = [];
    for (const m of this.o.chips) {
      const x = c.timeX(m.time);
      if (x === null || x < -R || x > w + R) continue;
      placed.push({ n: m.n, x });
    }
    const lanes = assignLanes(placed.map((p) => p.x), MIN_GAP);
    this.pos = placed.map((p, i) => ({ n: p.n, x: p.x, y: TOP + R + lanes[i]! * (2 * R + 2) }));
    // linked guide first, so chips sit on top of it
    for (const p of this.pos) {
      if (p.n === this.o.highlight) {
        strokePath(scope, [{ x: p.x, y: p.y + R }, { x: p.x, y: h }], { color: this.o.accent, lineWidth: 1, dash: [3, 3], alpha: 0.6 });
      }
    }
    for (const p of this.pos) {
      const hot = p.n === this.o.highlight;
      ctx.beginPath();
      ctx.arc(p.x * hpr, p.y * vpr, R * hpr, 0, Math.PI * 2);
      ctx.fillStyle = this.o.bg;
      ctx.fill();
      ctx.lineWidth = (hot ? 2 : 1) * hpr;
      ctx.strokeStyle = hot ? this.o.accent : this.o.line;
      ctx.stroke();
      ctx.font = `${10 * vpr}px ${this.o.font}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = this.o.text;
      ctx.fillText(String(p.n), p.x * hpr, p.y * vpr + vpr * 0.5);
    }
  }
}