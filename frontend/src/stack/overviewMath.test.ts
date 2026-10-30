import { describe, expect, it } from "vitest";
import {
  anchorAtX, clusterTicks, MIN_SPAN_SEC, overviewRange, pickFromCluster, stepAnchor, timeAt, windowRect, WINDOW_MIN_PX, xOf, type OvTick,
} from "./overviewMath";

const T = 1_700_000_000;
const DAY = 86_400;
const tick = (i: number, t: number, dir: "long" | "short" = "long"): OvTick => ({ key: `M15:s${i}`, tf: "M15", id: `s${i}`, t, dir });

describe("DX9 overview maths", () => {
  it("range spans the ticks and widens a degenerate span", () => {
    expect(overviewRange([])).toBeNull();
    expect(overviewRange([T + 5 * DAY, T, T + DAY])).toEqual([T, T + 5 * DAY]);
    const r = overviewRange([T])!;
    expect(r[1] - r[0]).toBe(MIN_SPAN_SEC);
    expect(r[0]).toBeLessThan(T);
    expect(r[1]).toBeGreaterThan(T);
  });

  it("positions stay within [0, width]", () => {
    const range = [T, T + 10 * DAY] as const;
    expect(xOf(T, range, 800)).toBe(0);
    expect(xOf(T + 5 * DAY, range, 800)).toBe(400);
    expect(xOf(T + 10 * DAY, range, 800)).toBe(800);
    expect(xOf(T - DAY, range, 800)).toBe(0);
    expect(xOf(T + 99 * DAY, range, 800)).toBe(800);
  });

  it("clusters ticks closer than the threshold and keeps distant ones apart", () => {
    const range = [T, T + 1000] as const;
    const ticks = [tick(1, T), tick(2, T + 2), tick(3, T + 500), tick(4, T + 1000)];
    const c = clusterTicks(ticks, range, 1000, 3);
    expect(c.map((x) => x.items.length)).toEqual([2, 1, 1]);
    expect(c[0]!.x).toBeCloseTo(1, 5);
    expect(clusterTicks(ticks, range, 1000, 1).map((x) => x.items.length)).toEqual([1, 1, 1, 1]);
    expect(clusterTicks([], range, 1000)).toEqual([]);
  });

  it("clustering is order-independent and loses no tick", () => {
    const range = [T, T + 100] as const;
    const ticks = Array.from({ length: 20 }, (_, i) => tick(i, T + i * 5));
    const a = clusterTicks(ticks, range, 100);
    const b = clusterTicks([...ticks].reverse(), range, 100);
    expect(a.map((c) => c.items.map((t) => t.key))).toEqual(b.map((c) => c.items.map((t) => t.key)));
    expect(a.reduce((s, c) => s + c.items.length, 0)).toBe(20);
  });

  it("a cluster click selects the first member, then cycles", () => {
    const c = clusterTicks([tick(1, T), tick(2, T + 1), tick(3, T + 2)], [T, T + 1000], 1000)[0]!;
    expect(pickFromCluster(c, null).id).toBe("s1");
    expect(pickFromCluster(c, "M15:s1").id).toBe("s2");
    expect(pickFromCluster(c, "M15:s3").id).toBe("s1");
    expect(pickFromCluster(c, "other").id).toBe("s1");
  });

  it("drag maps to a valid anchor and clamps at both ends", () => {
    const range = [T, T + 1000] as const;
    expect(anchorAtX(-50, range, 500)).toBe(T);
    expect(anchorAtX(0, range, 500)).toBe(T);
    expect(anchorAtX(250, range, 500)).toBe(T + 500);
    expect(anchorAtX(9999, range, 500)).toBe(T + 1000);
    expect(timeAt(10, range, 0)).toBe(T);
  });

  it("keyboard step clamps to the range", () => {
    const range = [T, T + 1000] as const;
    expect(stepAnchor(T + 10, -1, 100, range)).toBe(T);
    expect(stepAnchor(T + 990, 1, 100, range)).toBe(T + 1000);
    expect(stepAnchor(T + 500, 1, 100, range)).toBe(T + 600);
  });

  it("focus window is clamped inside the track with a minimum width", () => {
    const range = [T, T + 1000] as const;
    expect(windowRect([T + 100, T + 200], range, 1000)).toEqual({ left: 100, width: 100 });
    expect(windowRect([T + 100, T + 100], range, 1000).width).toBe(WINDOW_MIN_PX);
    const edge = windowRect([T + 999, T + 5000], range, 1000);
    expect(edge.left + edge.width).toBeLessThanOrEqual(1000);
    expect(windowRect([T - 500, T - 100], range, 1000).left).toBe(0);
  });
});