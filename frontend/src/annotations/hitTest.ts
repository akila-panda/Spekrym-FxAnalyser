import type { Annotation } from "@/types/annotations";
import type { Coordinates } from "./primitives/types";

const KIND_PRIORITY: readonly Annotation["kind"][] = ["marker", "text", "trade", "level", "line", "polyline", "zone", "window"];

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function hits(a: Annotation, x: number, y: number, c: Coordinates, paneW: number, tol: number): boolean {
  switch (a.kind) {
    case "marker": {
      const mx = c.timeX(a.t0);
      const my = c.priceY(a.price);
      return mx !== null && my !== null && Math.hypot(x - mx, y - my) <= tol + 4;
    }
    case "text": {
      const tx = c.timeX(a.t0);
      const ty = c.priceY(a.price);
      return tx !== null && ty !== null && Math.abs(x - tx) <= 24 && y >= ty - 20 && y <= ty + 4;
    }
    case "level": {
      const x0 = c.timeX(a.t0);
      const x1 = a.t1 === undefined ? paneW : c.timeX(a.t1);
      const ly = c.priceY(a.price);
      return x0 !== null && x1 !== null && ly !== null && Math.abs(y - ly) <= tol && x >= Math.min(x0, x1) - tol && x <= Math.max(x0, x1) + tol;
    }
    case "zone": {
      const x0 = c.timeX(a.t0);
      const x1 = c.timeX(a.t1);
      const y0 = c.priceY(a.p_high);
      const y1 = c.priceY(a.p_low);
      if (x0 === null || x1 === null || y0 === null || y1 === null) return false;
      return x >= Math.min(x0, x1) && x <= Math.max(x0, x1) && y >= Math.min(y0, y1) && y <= Math.max(y0, y1);
    }
    case "window": {
      const x0 = c.timeX(a.t0);
      const x1 = c.timeX(a.t1);
      return x0 !== null && x1 !== null && x >= Math.min(x0, x1) && x <= Math.max(x0, x1);
    }
    case "line":
    case "polyline": {
      const pts = a.points.flatMap((p) => {
        const px = c.timeX(p.t);
        const py = c.priceY(p.p);
        return px === null || py === null ? [] : [{ x: px, y: py }];
      });
      return pts.some((p, i) => i > 0 && distToSegment(x, y, pts[i - 1]!.x, pts[i - 1]!.y, p.x, p.y) <= tol);
    }
    case "trade": {
      const x0 = c.timeX(a.t0);
      const x1 = c.timeX(a.t1);
      const ys = [a.entry, a.stop, a.target].map((p) => c.priceY(p));
      if (x0 === null || x1 === null || ys.some((v) => v === null)) return false;
      const lo = Math.min(...(ys as number[]));
      const hi = Math.max(...(ys as number[]));
      return x >= Math.min(x0, x1) && x <= Math.max(x0, x1) && y >= lo && y <= hi;
    }
    // banded_zone, fib_zone, bar_highlight, series, band are not hit-tested yet (rendering lands in Phases 15/18).
    default:
      return false;
  }
}

/** The annotation under the cursor (CSS px in the pane), preferring small, precise shapes over big areas. */
export function hitTest(annotations: readonly Annotation[], x: number, y: number, c: Coordinates, paneW: number, tol = 6): Annotation | null {
  for (const kind of KIND_PRIORITY) {
    const found = annotations.find((a) => a.kind === kind && hits(a, x, y, c, paneW, tol));
    if (found) return found;
  }
  return null;
}