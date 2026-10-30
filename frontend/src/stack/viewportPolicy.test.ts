import { beforeEach, describe, expect, it } from "vitest";
import { TF_SECONDS, type Candle, type Timeframe } from "@/types/market";
import type { StrategyDef } from "@/types/strategy";
import { useRowsStore } from "./rowsStore";
import {
  barsToShow,
  deriveViewport,
  hiddenRows,
  resolveFocusTF,
  rowClass,
  rowWeight,
  STACK_ORDER,
  stackRowClasses,
  supportedRows,
  visibleRows,
  VIEWPORT_POLICY,
  type Focus,
} from "./viewportPolicy";

const T0 = Date.UTC(2025, 3, 7, 0, 0, 0) / 1000;
const run = (tf: Timeframe, n: number, start = T0): Candle[] =>
  Array.from({ length: n }, (_, i) => ({ time: start + i * TF_SECONDS[tf], open: 1, high: 1, low: 1, close: 1, volume: 1 }));
const focus: Focus = { anchor: T0 + 3600 * 100, interval: [T0 + 3600 * 100, T0 + 3600 * 101], parentTF: "H1", drillDepth: 0 };

describe("S3 ViewportPolicy", () => {
  it("stack order is D,H4,H1,M15,M5,M1", () => {
    expect(STACK_ORDER).toEqual(["D", "H4", "H1", "M15", "M5", "M1"]);
  });
  it("each TF derives its own range, within its own min/max", () => {
    for (const tf of STACK_ORDER) {
      const n = barsToShow(tf, focus);
      expect(n).toBeGreaterThanOrEqual(VIEWPORT_POLICY[tf].minContext);
      expect(n).toBeLessThanOrEqual(VIEWPORT_POLICY[tf].maxContext);
    }
    const sizes = new Set(STACK_ORDER.map((tf) => barsToShow(tf, focus)));
    expect(sizes.size).toBeGreaterThan(1); // not one shared range
  });
  it("D shows ~20-40 bars and M1 ~100-300 around the same focus", () => {
    expect(barsToShow("D", focus)).toBeGreaterThanOrEqual(20);
    expect(barsToShow("D", focus)).toBeLessThanOrEqual(40);
    expect(barsToShow("M1", focus)).toBeGreaterThanOrEqual(100);
    expect(barsToShow("M1", focus)).toBeLessThanOrEqual(300);
  });
  it("lower TFs make the focus fill ~focusCoverage of the width", () => {
    // H1 focus = 12 M5 bars; coverage 0.5 => 24, clamped up to M5 minContext 60
    expect(barsToShow("M5", focus)).toBe(60);
    const long: Focus = { ...focus, parentTF: "D", interval: [T0, T0 + 86400] };
    expect(barsToShow("M15", long)).toBe(120); // 96 bars / 0.5 = 192 -> clamp 120
  });
  it("centres the viewport on the focus midpoint, in logical indexes", () => {
    const bars = run("M5", 2000);
    const vp = deriveViewport("M5", focus, bars)!;
    const mid = (focus.interval[0] + focus.interval[1]) / 2;
    const centreIdx = (mid - T0) / 300;
    expect((vp.from + vp.to) / 2).toBeCloseTo(centreIdx, 5);
    expect(vp.to - vp.from).toBe(barsToShow("M5", focus));
  });
  it("can run past the data (negative from) and returns null with no data", () => {
    const bars = run("M5", 10);
    const early: Focus = { ...focus, interval: [T0, T0 + 3600], anchor: T0 };
    expect(deriveViewport("M5", early, bars)!.from).toBeLessThan(0);
    expect(deriveViewport("M5", focus, [])).toBeNull();
  });
});

const strat = (supported: Timeframe[], context: Timeframe[]) =>
  ({ supported_timeframes: supported, context_timeframes: context }) as Pick<StrategyDef, "supported_timeframes" | "context_timeframes">;
const set = (...tfs: Timeframe[]) => new Set<Timeframe>(tfs);

describe("DX1 row classes", () => {
  it("orders hidden > collapsed > focus > detail > context", () => {
    const input = { focusTF: "M15" as Timeframe, supported: set("M15", "M5", "H1"), hidden: set("M1", "H1") };
    expect(rowClass("M1", input)).toBe("hidden");
    expect(rowClass("H1", input)).toBe("hidden"); // hidden beats supported
    expect(rowClass("H4", input)).toBe("collapsed");
    expect(rowClass("M15", input)).toBe("focus");
    expect(rowClass("M5", input)).toBe("detail");
    expect(rowClass("D", { focusTF: "M15" })).toBe("context");
  });
  it("classifies below the focus as detail and above as context", () => {
    const c = stackRowClasses({ focusTF: "H1" });
    expect(STACK_ORDER.map((tf) => c[tf])).toEqual(["context", "context", "focus", "detail", "detail", "detail"]);
    expect(c.W).toBe("hidden");
  });
  it("moves the focus to the nearest visible supported row", () => {
    expect(resolveFocusTF("M15", { supported: set("M5", "M1") })).toBe("M5");
    expect(resolveFocusTF("M15", { hidden: set("M15", "M5") })).toBe("H1");
    expect(resolveFocusTF("D", { supported: set("H4") })).toBe("H4");
    expect(resolveFocusTF(null, {})).toBe("M15");
    expect(resolveFocusTF("M15", { supported: set() })).toBeNull();
    const c = stackRowClasses({ focusTF: "M15", supported: set("M5", "M1") });
    expect(c.M5).toBe("focus");
    expect(c.M15).toBe("collapsed");
  });
  it("weights: focus 2.0, detail 1.5, context 0.8, D 0.7, collapsed/hidden 0", () => {
    expect(rowWeight("M15", "focus")).toBe(2);
    expect(rowWeight("M5", "detail")).toBe(1.5);
    expect(rowWeight("H4", "context")).toBe(0.8);
    expect(rowWeight("D", "context")).toBe(0.7);
    expect(rowWeight("H1", "collapsed")).toBe(0);
    expect(rowWeight("H1", "hidden")).toBe(0);
  });
});

describe("DX1 visible rows", () => {
  it("defaults to supported + context TFs, top-down", () => {
    expect(visibleRows(strat(["M5", "M15"], ["H1"]))).toEqual(["H1", "M15", "M5"]);
    expect([...hiddenRows(strat(["M5", "M15"], ["H1"]))]).toEqual(["D", "H4", "M1"]);
  });
  it("shows all rows without a strategy", () => {
    expect(visibleRows(null)).toEqual([...STACK_ORDER]);
    expect(hiddenRows(undefined).size).toBe(0);
  });
  it("a user override wins; an empty override falls back to the default", () => {
    const s = strat(["M5"], []);
    expect(visibleRows(s, set("D", "M1"))).toEqual(["D", "M1"]);
    expect(visibleRows(s, set())).toEqual(["M5"]);
    expect(visibleRows(s, set("W"))).toEqual(["M5"]);
  });
  it("supportedRows is null without a strategy", () => {
    expect(supportedRows(null)).toBeNull();
    expect([...supportedRows(strat(["M5"], ["H1"]))!]).toEqual(["M5"]);
  });
});

describe("DX1 rowsStore", () => {
  const s = strat(["M5", "M1"], ["H1"]);
  beforeEach(() => useRowsStore.getState().reset());
  it("toggles a row off and on, starting from the strategy default", () => {
    useRowsStore.getState().toggle("H1", s);
    expect(visibleRows(s, useRowsStore.getState().visible)).toEqual(["M5", "M1"]);
    useRowsStore.getState().toggle("D", s);
    expect(visibleRows(s, useRowsStore.getState().visible)).toEqual(["D", "M5", "M1"]);
  });
  it("never removes the last visible row", () => {
    const one = strat(["M5"], []);
    useRowsStore.getState().toggle("M5", one);
    expect(visibleRows(one, useRowsStore.getState().visible)).toEqual(["M5"]);
  });
  it("ignores W and resets", () => {
    useRowsStore.getState().toggle("W", s);
    expect(useRowsStore.getState().visible).toBeNull();
    useRowsStore.getState().toggle("D", s);
    useRowsStore.getState().reset();
    expect(useRowsStore.getState().visible).toBeNull();
  });
});