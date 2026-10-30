import { describe, expect, it } from "vitest";
import { assignLanes, buildChips } from "./evidenceChips";

const SEC = 300;
const T0 = 1_700_000_000 - (1_700_000_000 % SEC);
const bars = Array.from({ length: 12 }, (_, i) => ({ time: T0 + i * SEC }));
const steps = [
  { n: 2, label: "Break", known_at: T0 + 5 * SEC + 40 },
  { n: 1, label: "Range", known_at: T0 + 2 * SEC },
  { n: 3, label: "Retest", known_at: T0 + 5 * SEC + 200 },
];

describe("DX4 evidence chips", () => {
  it("places chips on the containing bar in causal order", () => {
    const c = buildChips(steps, bars, SEC, null);
    expect(c.map((x) => x.n)).toEqual([1, 2, 3]);
    expect(c[0]!.time).toBe(T0 + 2 * SEC);
    expect(c[1]!.time).toBe(T0 + 5 * SEC);
    expect(c[2]!.time).toBe(T0 + 5 * SEC);
  });
  it("never reads past asOf", () => {
    expect(buildChips(steps, bars, SEC, T0 + 5 * SEC + 100).map((x) => x.n)).toEqual([1, 2]);
  });
  it("upTo limits to the replayed steps", () => {
    expect(buildChips(steps, bars, SEC, null, 1).map((x) => x.n)).toEqual([1]);
  });
  it("skips steps outside the loaded bars", () => {
    expect(buildChips([{ n: 1, label: "x", known_at: T0 - 10 * SEC }], bars, SEC, null)).toEqual([]);
    expect(buildChips([{ n: 1, label: "x", known_at: T0 + 40 * SEC }], bars, SEC, null)).toEqual([]);
    expect(buildChips(steps, [], SEC, null)).toEqual([]);
  });
  it("assigns lanes to chips that are too close", () => {
    expect(assignLanes([10, 40, 50, 52], 18)).toEqual([0, 0, 1, 2]);
    expect(assignLanes([0, 1, 2, 3, 4, 5], 18, 3)).toEqual([0, 1, 2, 2, 2, 2]);
    expect(assignLanes([], 18)).toEqual([]);
  });
});