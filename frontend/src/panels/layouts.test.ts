import { PANEL_ORDER, type Timeframe } from "@/types/market";
import { computeRects, defaultLayoutForWidth, GAP, type Rect, type Size } from "./layouts";

const SIZES: Size[] = [
  { width: 1200, height: 800 },
  { width: 1920, height: 1000 },
  { width: 1001, height: 601 },
  { width: 640, height: 480 },
];

const present = (r: Record<Timeframe, Rect | null>) => PANEL_ORDER.map((tf) => r[tf]).filter((x): x is Rect => x !== null);
const overlap = (a: Rect, b: Rect) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

function expectTiles(rects: Rect[], size: Size) {
  rects.forEach((r) => {
    expect(r.width).toBeGreaterThan(0);
    expect(r.height).toBeGreaterThan(0);
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.y).toBeGreaterThanOrEqual(0);
    expect(r.x + r.width).toBeLessThanOrEqual(size.width);
    expect(r.y + r.height).toBeLessThanOrEqual(size.height);
  });
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) expect(overlap(rects[i]!, rects[j]!)).toBe(false);
}

describe("defaultLayoutForWidth", () => {
  it("uses focus under 1280 px and grid from 1280 px", () => {
    expect(defaultLayoutForWidth(1279)).toBe("focus");
    expect(defaultLayoutForWidth(1024)).toBe("focus");
    expect(defaultLayoutForWidth(1280)).toBe("grid");
    expect(defaultLayoutForWidth(1920)).toBe("grid");
  });
});

describe("computeRects", () => {
  it.each(SIZES)("grid: 3 on top, 2 below, no overlap, fills the stage at %j", (size) => {
    const r = computeRects("grid", size, "M15");
    const rects = present(r);
    expect(rects).toHaveLength(5);
    expectTiles(rects, size);
    expect(r.H4!.y).toBe(0);
    expect(r.H1!.y).toBe(0);
    expect(r.M15!.y).toBe(0);
    expect(r.M5!.y).toBe(r.M1!.y);
    expect(r.M5!.y).toBe(r.H4!.height + GAP);
    expect(r.H4!.x + r.H4!.width + GAP).toBe(r.H1!.x);
    expect(r.M15!.x + r.M15!.width).toBe(size.width);
    expect(r.M1!.x + r.M1!.width).toBe(size.width);
    expect(r.M5!.y + r.M5!.height).toBe(size.height);
  });

  it.each(SIZES)("focus: focused chart is large, four stacked on the right at %j", (size) => {
    for (const focused of PANEL_ORDER) {
      const r = computeRects("focus", size, focused);
      const rects = present(r);
      expect(rects).toHaveLength(5);
      expectTiles(rects, size);
      const big = r[focused]!;
      expect(big.height).toBe(size.height);
      PANEL_ORDER.filter((tf) => tf !== focused).forEach((tf) => {
        expect(r[tf]!.width).toBeLessThan(big.width);
        expect(r[tf]!.x).toBe(big.width + GAP);
      });
      const lastTf = PANEL_ORDER.filter((tf) => tf !== focused).at(-1)!;
      expect(r[lastTf]!.y + r[lastTf]!.height).toBe(size.height);
    }
  });

  it.each(SIZES)("maximized: only the focused chart, full stage at %j", (size) => {
    const r = computeRects("maximized", size, "H1");
    expect(r.H1).toEqual({ x: 0, y: 0, width: size.width, height: size.height });
    expect(present(r)).toHaveLength(1);
  });
});