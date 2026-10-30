import { describe, expect, it } from "vitest";
import type { Setup } from "@/types";
import { exitTime, focusSegments, listPosition, segmentAnchor, segmentAt, segmentWeights } from "./focusSegments";

const T = 1_700_000_000;
const trade = (exit: number | null) =>
  ({ kind: "trade", exit_time: exit, id: "t", t0: T, t1: T + 600 }) as unknown as Setup["annotations"][number];
const mk = (exit: number | null | "none", known = [T + 100]): Pick<Setup, "annotations" | "focus" | "steps"> => ({
  focus: { from: T, to: T + 600 },
  steps: known.map((k, i) => ({ n: i + 1, label: "s", known_at: k })),
  annotations: exit === "none" ? [] : [trade(exit)],
});

describe("DX5 focus segments", () => {
  it("builds Context / Setup / Target from the setup times", () => {
    const s = focusSegments(mk(T + 1800));
    expect(s.map((x) => x.key)).toEqual(["context", "setup", "target"]);
    expect(s[1]).toMatchObject({ from: T, to: T + 600 });
    expect(s[2]).toMatchObject({ from: T + 600, to: T + 1800 });
    expect(s[0]!.to).toBe(T);
    expect(s[0]!.from).toBe(T - 3600);
  });
  it("omits Target when the exit time is absent or not after the setup", () => {
    expect(focusSegments(mk("none")).map((x) => x.key)).toEqual(["context", "setup"]);
    expect(focusSegments(mk(null)).map((x) => x.key)).toEqual(["context", "setup"]);
    expect(focusSegments(mk(T + 300)).map((x) => x.key)).toEqual(["context", "setup"]);
    expect(exitTime(mk(null))).toBeNull();
  });
  it("lead-in reaches back to the earliest known step", () => {
    expect(focusSegments(mk("none", [T - 7200, T + 10]))[0]!.from).toBe(T - 7200);
  });
  it("weights sum to 1 with a floor", () => {
    const w = segmentWeights(focusSegments(mk(T + 100_000)));
    expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    expect(Math.min(...w)).toBeGreaterThan(0.1);
    expect(segmentWeights([])).toEqual([]);
  });
  it("finds the segment containing a time", () => {
    const s = focusSegments(mk(T + 1800));
    expect(segmentAt(s, T - 10)).toBe("context");
    expect(segmentAt(s, T)).toBe("setup");
    expect(segmentAt(s, T + 600)).toBe("target");
    expect(segmentAt(s, T + 1800)).toBe("target");
    expect(segmentAt(s, T + 9999)).toBeNull();
    expect(segmentAt(s, null)).toBeNull();
  });
  it("never anchors past asOf", () => {
    const s = focusSegments(mk(T + 1800));
    expect(segmentAnchor(s[2]!, T + 100)).toBeNull();
    expect(segmentAnchor(s[2]!, T + 700)).toBe(T + 600);
    expect(segmentAnchor(s[1]!, null)).toBe(T);
  });
  it("list position is 1-based and null when missing", () => {
    const rows = [{ key: "M5:a" }, { key: "M5:b" }, { key: "M1:a" }];
    expect(listPosition(rows, "M5:b")).toEqual({ index: 2, total: 3 });
    expect(listPosition(rows, "x")).toBeNull();
    expect(listPosition(rows, null)).toBeNull();
  });
});