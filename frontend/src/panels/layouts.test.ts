import { PANEL_ORDER, type Timeframe } from "@/types/market";
import { COLLAPSED_ROW_PX, STACK_ORDER } from "@/stack/viewportPolicy";
import { computeRects, defaultLayoutForWidth, GAP, planStackRows, STACK_BAR_PX, STACK_TIMELINE_PX, type Rect, type Size } from "./layouts";

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

const STACK_SIZES: Size[] = [
  { width: 1000, height: 1000 },
  { width: 1440, height: 900 },
  { width: 900, height: 700 },
  { width: 1280, height: 560 },
];
const stackRects = (r: Record<Timeframe, Rect | null>) => STACK_ORDER.map((tf) => r[tf]).filter((x): x is Rect => x !== null);
const availOf = (size: Size) => size.height - STACK_BAR_PX - STACK_TIMELINE_PX;

describe("DX1 stack geometry", () => {
  it.each(STACK_SIZES)("focus row is strictly the tallest, rows tile and sum to the height at %j", (size) => {
    for (const focused of STACK_ORDER) {
      const r = computeRects("stack", size, focused);
      const rects = stackRects(r);
      expect(rects).toHaveLength(6);
      const heights = rects.map((x) => x.height);
      expect(r[focused]!.height).toBeGreaterThan(Math.max(...STACK_ORDER.filter((t) => t !== focused).map((t) => r[t]!.height)));
      expect(heights.reduce((a, b) => a + b, 0) + GAP * 5).toBe(availOf(size));
      let y = STACK_BAR_PX;
      for (const x of rects) {
        expect(x.y).toBe(y);
        y += x.height + GAP;
      }
    }
  });

  it("collapsed rows are exactly 28px and the rest split the remainder", () => {
    const size = { width: 1440, height: 900 };
    const r = computeRects("stack", size, "M15", { focusTF: "M15", supported: new Set<Timeframe>(["M15", "M5", "M1"]) });
    for (const tf of ["D", "H4", "H1"] as const) expect(r[tf]!.height).toBe(COLLAPSED_ROW_PX);
    expect(rects3(r)).toBe(availOf(size));
    expect(r.M15!.height).toBeGreaterThan(r.M5!.height);
    expect(r.M5!.height).toBeGreaterThan(0);
  });

  it("hidden rows are not laid out and give their height to the rest", () => {
    const size = { width: 1440, height: 900 };
    const all = computeRects("stack", size, "M15");
    const r = computeRects("stack", size, "M15", { hidden: new Set<Timeframe>(["D", "M1"]) });
    expect(r.D).toBeNull();
    expect(r.M1).toBeNull();
    expect(r.H4!.y).toBe(STACK_BAR_PX);
    expect(r.M15!.height).toBeGreaterThan(all.M15!.height);
    expect(stackRects(r).reduce((a, x) => a + x.height, 0) + GAP * 3).toBe(availOf(size));
  });

  it("falls back to another focus row when the requested one is collapsed or hidden", () => {
    const plan = planStackRows(600, { focusTF: "M15", supported: new Set<Timeframe>(["M5"]) });
    expect(plan.find((p) => p.cls === "focus")?.tf).toBe("M5");
    const plan2 = planStackRows(600, { focusTF: "M15", hidden: new Set<Timeframe>(["M15"]) });
    expect(plan2.find((p) => p.cls === "focus")?.tf).not.toBe("M15");
  });

  it("a short viewport demotes context rows first, then detail rows", () => {
    const base = { focusTF: "M15" as Timeframe };
    const roomy = planStackRows(600, base);
    expect(roomy.every((p) => !p.demoted)).toBe(true);
    const some = planStackRows(390, base);
    expect(some.find((p) => p.tf === "D")).toMatchObject({ cls: "collapsed", demoted: true, height: COLLAPSED_ROW_PX });
    expect(some.find((p) => p.tf === "H1")!.demoted).toBe(false);
    const ctx = planStackRows(330, base);
    expect(ctx.filter((p) => p.demoted).map((p) => p.tf)).toEqual(["D", "H4", "H1"]);
    expect(ctx.find((p) => p.tf === "M5")!.cls).toBe("detail");
    const tiny = planStackRows(250, base);
    expect(tiny.find((p) => p.tf === "M1")!.demoted).toBe(true);
    expect(tiny.find((p) => p.tf === "M15")!.cls).toBe("focus");
  });

  it("minimums hold when there is room: focus >= 120, others >= 56", () => {
    const plan = planStackRows(430, { focusTF: "M15" });
    for (const p of plan) expect(p.height).toBeGreaterThanOrEqual(p.cls === "focus" ? 120 : 56);
  });

  it("lays out nothing when every row is hidden or the stage is empty", () => {
    expect(planStackRows(500, { focusTF: "M15", hidden: new Set<Timeframe>(STACK_ORDER) })).toEqual([]);
    const r = computeRects("stack", { width: 800, height: 0 }, "M15");
    expect(stackRects(r).every((x) => x.height >= 0)).toBe(true);
  });

  it("all-collapsed stacks take fixed pixels only", () => {
    const plan = planStackRows(500, { focusTF: "M15", supported: new Set<Timeframe>() });
    expect(plan.every((p) => p.cls === "collapsed" && p.height === COLLAPSED_ROW_PX)).toBe(true);
  });
});

function rects3(r: Record<Timeframe, Rect | null>): number {
  const rs = STACK_ORDER.map((tf) => r[tf]).filter((x): x is Rect => x !== null);
  return rs.reduce((a, x) => a + x.height, 0) + GAP * (rs.length - 1);
}