import { describe, expect, it } from "vitest";
import { bucketStart, isHigherTf, PANEL_ORDER, TF_ANCHOR, TF_ORDER_HIGH_TO_LOW, TF_SECONDS, TIMEFRAMES } from "./market";

describe("S1 timeframes", () => {
  it("includes W and D", () => {
    expect(TIMEFRAMES).toContain("W");
    expect(TIMEFRAMES).toContain("D");
    expect(TF_SECONDS.D).toBe(86400);
    expect(TF_SECONDS.W).toBe(604800);
  });
  it("orders high to low by seconds and covers every TF", () => {
    const secs = TF_ORDER_HIGH_TO_LOW.map((t) => TF_SECONDS[t]);
    expect([...secs].sort((a, b) => b - a)).toEqual(secs);
    expect([...TF_ORDER_HIGH_TO_LOW].sort()).toEqual([...TIMEFRAMES].sort());
  });
  it("keeps the 5-panel grid unchanged", () => {
    expect(PANEL_ORDER).toEqual(["H4", "H1", "M15", "M5", "M1"]);
  });
  it("isHigherTf compares by duration", () => {
    expect(isHigherTf("W", "D")).toBe(true);
    expect(isHigherTf("M1", "M5")).toBe(false);
    expect(isHigherTf("H1", "H1")).toBe(false);
  });
  it("anchors D at 22:00 UTC and W at Sunday 22:00 UTC", () => {
    const sunOpen = Date.UTC(2025, 3, 6, 22, 0, 0) / 1000;
    expect(bucketStart("W", sunOpen)).toBe(sunOpen);
    expect(bucketStart("W", sunOpen + 5 * 86400)).toBe(sunOpen);
    expect(bucketStart("W", sunOpen + 7 * 86400 - 1)).toBe(sunOpen);
    expect(bucketStart("W", sunOpen + 7 * 86400)).toBe(sunOpen + 7 * 86400);
    expect(bucketStart("D", sunOpen + 3600)).toBe(sunOpen);
    expect(bucketStart("D", sunOpen - 1)).toBe(sunOpen - 86400);
    expect(TF_ANCHOR.M5).toBe(0);
  });
});