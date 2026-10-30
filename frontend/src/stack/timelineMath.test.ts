import { describe, expect, it } from "vitest";
import { timeToLogical } from "@/annotations/primitives/coords";
import { TF_SECONDS, type Candle, type Timeframe } from "@/types/market";
import { clampSpan, formatSpan, logicalToTime, MAX_SPAN, MIN_LOGICAL_WIDTH, MIN_SPAN, rangeFor, sliderBounds, spanFromRange } from "./timelineMath";

const T0 = Date.UTC(2025, 3, 7, 0, 0, 0) / 1000;
const run = (tf: Timeframe, n: number, start = T0): Candle[] =>
  Array.from({ length: n }, (_, i) => ({ time: start + i * TF_SECONDS[tf], open: 1, high: 1, low: 1, close: 1, volume: 1 }));

describe("Timeline Sync math", () => {
  it("every row's left edge sits exactly at the anchor", () => {
    const anchor = T0 + 3600 + 600; // 01:10
    for (const tf of ["H1", "M15", "M5", "M1"] as const) {
      const bars = run(tf, 500);
      const r = rangeFor(bars, TF_SECONDS[tf], anchor, 3 * 3600)!;
      expect(logicalToTime(r.from, bars, TF_SECONDS[tf])).toBeCloseTo(anchor, 3);
    }
  });

  it("every row shows the same time width", () => {
    const anchor = T0 + 7200;
    const span = 4 * 3600;
    for (const tf of ["H1", "M15", "M5", "M1"] as const) {
      const bars = run(tf, 800);
      const r = rangeFor(bars, TF_SECONDS[tf], anchor, span)!;
      const w = logicalToTime(r.to, bars, TF_SECONDS[tf])! - logicalToTime(r.from, bars, TF_SECONDS[tf])!;
      expect(w).toBeCloseTo(span, 3);
    }
  });

  it("H4 is floored to a minimum width but keeps the anchor", () => {
    const bars = run("H4", 100);
    const r = rangeFor(bars, TF_SECONDS.H4, T0 + 3 * 3600, 3 * 3600)!;
    expect(r.to - r.from).toBeGreaterThanOrEqual(MIN_LOGICAL_WIDTH);
    expect(logicalToTime(r.from, bars, TF_SECONDS.H4)).toBeCloseTo(T0 + 3 * 3600, 3);
  });

  it("logicalToTime inverts timeToLogical", () => {
    const bars = run("M5", 50);
    for (const t of [T0 - 600, T0, T0 + 123 * 2, T0 + 49 * 300 + 100, T0 + 80 * 300]) {
      expect(logicalToTime(timeToLogical(t, bars, 300)!, bars, 300)).toBeCloseTo(t, 3);
    }
    expect(logicalToTime(1, [], 300)).toBeNull();
  });

  it("spanFromRange reads the zoomed width, ignores floored/narrow rows", () => {
    const bars = run("M1", 600);
    expect(spanFromRange({ from: 10, to: 130 }, bars, 60)).toBe(7200);
    expect(spanFromRange({ from: 10, to: 12 }, bars, 60)).toBeNull();
  });

  it("clamps the span", () => {
    expect(clampSpan(1)).toBe(MIN_SPAN);
    expect(clampSpan(1e9)).toBe(MAX_SPAN);
  });

  it("slider bounds: whole minutes, capped at asOf, null when unknown", () => {
    expect(sliderBounds([], { first: T0 + 5, last: T0 + 7200 + 5 }, null)).toEqual({ min: T0 + 60, max: T0 + 7200 });
    expect(sliderBounds([], { first: T0, last: T0 + 7200 }, T0 + 3600)).toEqual({ min: T0, max: T0 + 3600 });
    expect(sliderBounds(run("M1", 10), null, null)).toEqual({ min: T0, max: T0 + 9 * 60 });
    expect(sliderBounds([], null, null)).toBeNull();
  });

  it("formats spans", () => {
    expect(formatSpan(2700)).toBe("45m");
    expect(formatSpan(10800)).toBe("3h");
    expect(formatSpan(172800)).toBe("2d");
  });
});