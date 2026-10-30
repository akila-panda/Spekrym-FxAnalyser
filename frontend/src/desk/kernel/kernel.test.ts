import { describe, expect, it } from "vitest";
import { TF_SECONDS, type Candle } from "@/types/market";
import { fromRows, flatRows } from "@/desk/__fixtures__/builders";
import { FIXTURES, range, sweep, trend, zone } from "@/desk/__fixtures__/fixtures";
import { deepCandles } from "@/desk/mock/deepMock";
import { atr } from "./atr";
import { closedBars } from "./closedBars";
import { findDisplacements } from "./displacement";
import { runKernel } from "./kernel";
import { findSwings } from "./swings";

const ctx = { pair: "EUR_USD", tf: "H1" } as const;
const idx = (s: { index: number; kind: string }[], kind: string) => s.filter((x) => x.kind === kind).map((x) => x.index);

describe("closedBars", () => {
  const c: Candle[] = Array.from({ length: 5 }, (_, i) => ({ time: i * 60, open: 1, high: 1, low: 1, close: 1, volume: 1 }));
  it("excludes the forming bar", () => {
    expect(closedBars(c, "M1", 180)).toHaveLength(3);
    expect(closedBars(c, "M1", 179.999)).toHaveLength(2);
    expect(closedBars(c, "M1", 0)).toHaveLength(0);
    expect(closedBars(c, "M1", Infinity)).toHaveLength(5);
  });
});

describe("atr", () => {
  it("warm-up null, then Wilder", () => {
    const a = atr(fromRows("H1", flatRows(30, 1.1, 0.0004)), 14);
    expect(a.slice(0, 13).every((v) => v === null)).toBe(true);
    expect(a[13]).toBeCloseTo(0.0004, 10);
    expect(a[29]).toBeCloseTo(0.0004, 10);
  });
  it("is causal (prefix equality)", () => {
    const bars = deepCandles("EUR_USD", "H1").slice(0, 400);
    const full = atr(bars);
    expect(atr(bars.slice(0, 250))).toEqual(full.slice(0, 250));
  });
});

describe("swings", () => {
  it("trend: HH/HL at known indices, known_at = confirmation close", () => {
    const s = findSwings(trend.candles, "H1", 3);
    expect(idx(s, "high")).toEqual(trend.meta.highs);
    expect(idx(s, "low")).toEqual(trend.meta.lows);
    const first = s[0]!;
    expect(first.known_at).toBe(trend.candles[first.index + 3]!.time + TF_SECONDS.H1);
  });
  it("range: equal highs and equal lows", () => {
    const s = findSwings(range.candles, "H1", 3);
    const hi = s.filter((x) => x.kind === "high").map((x) => x.price);
    expect(new Set(hi).size).toBe(1);
    expect(idx(s, "low")).toEqual(range.meta.lows);
  });
  it("sweep: equal swing highs precede the sweep bar", () => {
    const hs = findSwings(sweep.candles, "H1", 3).filter((x) => x.kind === "high");
    expect(hs.slice(0, 2).map((x) => x.index)).toEqual(sweep.meta.equalHighs);
    expect(hs[0]!.price).toBeCloseTo(hs[1]!.price, 10);
    const bar = sweep.candles[sweep.meta.sweepBar as number]!;
    expect(bar.high).toBeGreaterThan(hs[0]!.price);
    expect(bar.close).toBeLessThan(hs[0]!.price);
  });
  it("swing scale ⊆ internal scale", () => {
    const r = runKernel(deepCandles("EUR_USD", "H1"), { ...ctx, asOf: Infinity });
    const internal = new Set(r.swingsInternal.map((x) => `${x.index}${x.kind}`));
    expect(r.swingsSwing.length).toBeGreaterThan(0);
    expect(r.swingsSwing.every((x) => internal.has(`${x.index}${x.kind}`))).toBe(true);
    expect(r.swingsSwing.length).toBeLessThan(r.swingsInternal.length);
  });
});

describe("displacement", () => {
  it("zone: one bull displacement starting at departure, rest absorbed", () => {
    const a = atr(zone.candles);
    const d = findDisplacements(zone.candles, a, ctx, 1.5, 3);
    expect(d).toHaveLength(1);
    expect(d[0]!.startIndex).toBe(zone.meta.depart);
    expect(d[0]!.direction).toBe("bull");
    expect(d[0]!.magnitudeAtr).toBeGreaterThanOrEqual(1.5);
    expect(d[0]!.id).toBe(`disp:EUR_USD:H1:${zone.candles[23]!.time}`);
  });
  it("flat bars produce none", () => {
    const bars = fromRows("H1", flatRows(40, 1.1, 0.0004));
    expect(findDisplacements(bars, atr(bars), ctx, 1.5, 3)).toEqual([]);
  });
});

describe("kernel", () => {
  it("runs on every fixture and honours asOf", () => {
    for (const f of FIXTURES) {
      const full = runKernel(f.candles, { ...ctx, asOf: Infinity });
      expect(full.bars).toHaveLength(f.candles.length);
      const cut = f.candles[10]!.time + TF_SECONDS.H1;
      expect(runKernel(f.candles, { ...ctx, asOf: cut }).bars).toHaveLength(11);
    }
  });
});