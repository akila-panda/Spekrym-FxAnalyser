import { describe, expect, it } from "vitest";
import { TF_ANCHOR, TF_SECONDS, TIMEFRAMES, type Candle } from "@/types/market";
import { generateDataset, getDataset, isMarketClosed, MOCK_END, MOCK_START } from "./generateCandles";

const ds = getDataset("EUR_USD");

describe("generateCandles", () => {
  it("is deterministic for a fixed seed and differs by pair and seed", () => {
    expect(generateDataset("EUR_USD", 1).M5).toEqual(ds.M5);
    expect(generateDataset("EUR_USD", 2).M5).not.toEqual(ds.M5);
    expect(getDataset("GBP_USD").M5[0]?.open).not.toBe(ds.M5[0]?.open);
  });

  it("has valid OHLC, ascending aligned times and positive volume on every bar", () => {
    for (const tf of TIMEFRAMES) {
      let prev = -1;
      for (const c of ds[tf]) {
        expect(c.high).toBeGreaterThanOrEqual(Math.max(c.open, c.close));
        expect(c.low).toBeLessThanOrEqual(Math.min(c.open, c.close));
        expect(c.low).toBeGreaterThan(0);
        expect(c.volume).toBeGreaterThan(0);
        expect(c.time).toBeGreaterThan(prev);
        expect((c.time - TF_ANCHOR[tf]) % TF_SECONDS[tf]).toBe(0);
        prev = c.time;
      }
    }
  }, 30_000);

  it("aggregates M5..H4 from M1 exactly", () => {
    for (const tf of ["M5", "M15", "H1", "H4"] as const) {
      const sec = TF_SECONDS[tf];
      const groups = new Map<number, Candle[]>();
      for (const c of ds.M1) {
        const k = Math.floor(c.time / sec) * sec;
        groups.set(k, [...(groups.get(k) ?? []), c]);
      }
      expect(ds[tf].length).toBe(groups.size);
      for (const agg of ds[tf]) {
        const g = groups.get(agg.time) ?? [];
        expect(agg.open).toBe(g[0]?.open);
        expect(agg.close).toBe(g[g.length - 1]?.close);
        expect(agg.high).toBe(Math.max(...g.map((x) => x.high)));
        expect(agg.low).toBe(Math.min(...g.map((x) => x.low)));
        expect(agg.volume).toBe(g.reduce((s, x) => s + x.volume, 0));
      }
    }
  }, 30_000);

  it("leaves a Friday 22:00 to Sunday 22:00 UTC gap", () => {
    expect(ds.M1.some((c) => isMarketClosed(c.time))).toBe(false);
    const gaps = ds.M1.slice(1).filter((c, i) => c.time - (ds.M1[i]?.time ?? 0) > 3600);
    expect(gaps.length).toBeGreaterThanOrEqual(4);
    expect(gaps.every((c) => c.time % 86400 === 79200)).toBe(true);
    expect(ds.M1[0]?.time).toBe(MOCK_START);
    expect((ds.M1[ds.M1.length - 1]?.time ?? 0) < MOCK_END).toBe(true);
  });

  it("uses 3 decimals for JPY pairs", () => {
    for (const c of getDataset("USD_JPY").M5.slice(0, 500)) {
      expect(Math.abs(c.close * 1000 - Math.round(c.close * 1000))).toBeLessThan(1e-6);
    }
  });
});