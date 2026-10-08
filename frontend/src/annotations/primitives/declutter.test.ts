import { MIN_DRAW_WIDTH_PX, nudgeLabels, shouldDraw } from "./declutter";

describe("shouldDraw", () => {
  it("hides non-strong items under the threshold", () => {
    expect(shouldDraw("faint", MIN_DRAW_WIDTH_PX - 0.1)).toBe(false);
    expect(shouldDraw("normal", 1)).toBe(false);
    expect(shouldDraw(undefined, 0)).toBe(false);
  });
  it("draws items at or above the threshold", () => {
    expect(shouldDraw("faint", MIN_DRAW_WIDTH_PX)).toBe(true);
    expect(shouldDraw("normal", 40)).toBe(true);
  });
  it("never hides strong items", () => {
    expect(shouldDraw("strong", 0)).toBe(true);
    expect(shouldDraw("strong", 0.5)).toBe(true);
  });
});

describe("nudgeLabels", () => {
  const overlaps = (ys: number[], h: number) => ys.some((a, i) => ys.some((b, j) => i < j && Math.abs(a - b) < h));
  it("leaves separate labels alone", () => {
    expect(nudgeLabels([{ y: 10, h: 14 }, { y: 50, h: 14 }], 200)).toEqual([10, 50]);
  });
  it("separates overlapping labels and keeps the first in place", () => {
    const ys = nudgeLabels([{ y: 40, h: 14 }, { y: 42, h: 14 }, { y: 44, h: 14 }], 200);
    expect(ys[0]).toBe(40);
    expect(overlaps(ys, 14)).toBe(false);
  });
  it("keeps labels inside the pane", () => {
    const ys = nudgeLabels([{ y: 190, h: 14 }, { y: 192, h: 14 }], 200);
    ys.forEach((y) => {
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y + 14).toBeLessThanOrEqual(200);
    });
    expect(overlaps(ys, 14)).toBe(false);
  });
});