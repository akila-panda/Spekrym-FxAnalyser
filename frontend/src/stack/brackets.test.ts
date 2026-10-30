import { describe, expect, it } from "vitest";
import { TF_SECONDS, type Candle, type Timeframe } from "@/types/market";
import { bracketLabel, bracketsAllowed, buildBrackets, MAX_BRACKETS } from "./brackets";

const T0 = Date.UTC(2025, 3, 7, 0, 0, 0) / 1000; // Monday
const run = (tf: Timeframe, n: number, start = T0): Candle[] =>
  Array.from({ length: n }, (_, i) => ({ time: start + i * TF_SECONDS[tf], open: 1, high: 1, low: 1, close: 1, volume: 1 }));
const H = TF_SECONDS.H1;
const base = { parentTF: "H1" as const, childTF: "M5" as const, from: T0, to: T0 + 3 * H };

describe("S4 buildBrackets", () => {
  it("counts the children actually present per parent", () => {
    const out = buildBrackets({ ...base, parentBars: run("H1", 3), childBars: run("M5", 36) });
    expect(out.map((b) => b.count.present)).toEqual([12, 12, 12]);
    expect(out.every((b) => !b.count.partial)).toBe(true);
    expect(out[0]?.label).toBe("×12");
  });

  it("marks a parent with missing children partial (~N)", () => {
    const kids = run("M5", 36).filter((_, i) => i !== 14 && i !== 15);
    const out = buildBrackets({ ...base, parentBars: run("H1", 3), childBars: kids });
    expect(out[1]?.count).toEqual({ present: 10, expected: 12, partial: true });
    expect(out[1]?.label).toBe("~10");
  });

  it("flags the active parent from activeAt", () => {
    const out = buildBrackets({ ...base, parentBars: run("H1", 3), childBars: run("M5", 36), activeAt: T0 + H + 600 });
    expect(out.map((b) => b.active)).toEqual([false, true, false]);
  });

  it("forming parent: counts only closed children and carries the tag", () => {
    const asOf = T0 + H + 1800;
    const out = buildBrackets({ ...base, to: T0 + 2 * H, parentBars: run("H1", 2), childBars: run("M5", 36), asOf });
    expect(out[0]?.forming).toBe(false);
    expect(out[1]?.forming).toBe(true);
    expect(out[1]?.count.present).toBe(6);
    expect(out[1]?.label).toBe("~6 · forming");
  });

  it("returns nothing when the parent is not a higher TF", () => {
    expect(buildBrackets({ ...base, parentTF: "M5", childTF: "M5", parentBars: run("M5", 4), childBars: run("M5", 4) })).toEqual([]);
    expect(buildBrackets({ ...base, parentTF: "M1", childTF: "M5", parentBars: [], childBars: [] })).toEqual([]);
  });

  it("caps to the spans nearest the window end", () => {
    const out = buildBrackets({ ...base, to: T0 + 100 * H, parentBars: run("H1", 100), childBars: [], max: 10 });
    expect(out).toHaveLength(10);
    expect(out[9]?.open).toBe(T0 + 99 * H);
    expect(buildBrackets({ ...base, to: T0 + 200 * H, parentBars: run("H1", 200), childBars: [] })).toHaveLength(MAX_BRACKETS);
  });

  it("labels", () => {
    expect(bracketLabel({ present: 4, expected: 4, partial: false }, false)).toBe("×4");
    expect(bracketLabel({ present: 3, expected: 4, partial: true }, false)).toBe("~3");
  });

  it("DX2: skips hidden rows and hidden parents", () => {
    const all = ["D", "H4", "H1", "M15", "M5", "M1"] as const;
    expect(bracketsAllowed("M5", "H1", all)).toBe(true);
    expect(bracketsAllowed("M5", "H1", ["D", "M15", "M5"])).toBe(false);
    expect(bracketsAllowed("M5", "H1", ["H1", "M15"])).toBe(false);
    expect(bracketsAllowed("H1", "M5", all)).toBe(false);
  });
});