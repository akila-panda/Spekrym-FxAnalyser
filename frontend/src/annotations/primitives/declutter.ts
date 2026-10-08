import type { Emphasis } from "./types";

/** Items narrower than this (CSS px) are noise at the current zoom. */
export const MIN_DRAW_WIDTH_PX = 3;

/** Rule 6: hide items under about 3 px wide unless they are marked strong. */
export function shouldDraw(emphasis: Emphasis | undefined, widthPx: number): boolean {
  if (emphasis === "strong") return true;
  return widthPx >= MIN_DRAW_WIDTH_PX;
}

export interface LabelBox {
  /** Preferred top y and height, CSS px. */
  y: number;
  h: number;
}

/** Push overlapping labels apart vertically (input order = priority; earlier ones stay put).
 *  Results stay inside [0, maxY]. */
export function nudgeLabels(boxes: readonly LabelBox[], maxY: number, gap = 1): number[] {
  const placed: { y: number; h: number }[] = [];
  return boxes.map((b) => {
    let y = Math.min(Math.max(b.y, 0), Math.max(0, maxY - b.h));
    for (let guard = 0; guard < boxes.length + 1; guard++) {
      const hit = placed.find((p) => y < p.y + p.h + gap && p.y < y + b.h + gap);
      if (!hit) break;
      // move below the blocker; if that leaves the pane, move above it
      const below = hit.y + hit.h + gap;
      y = below + b.h <= maxY ? below : Math.max(0, hit.y - b.h - gap);
    }
    placed.push({ y, h: b.h });
    return y;
  });
}