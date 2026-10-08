import { describe, expect, it } from "vitest";
import type { Candle } from "@/types/market";
import { CandleCache, classifyChange } from "./candleCache";

const bar = (time: number, close = 1): Candle => ({ time, open: 1, high: 2, low: 0.5, close, volume: 10 });
const times = (c: readonly Candle[]) => c.map((x) => x.time);

describe("CandleCache", () => {
  it("merges out-of-order batches into ascending order", () => {
    const c = new CandleCache();
    c.merge("EUR_USD", "M5", [bar(500), bar(300)]);
    c.merge("EUR_USD", "M5", [bar(400), bar(100), bar(200)]);
    expect(times(c.get("EUR_USD", "M5"))).toEqual([100, 200, 300, 400, 500]);
    expect(c.oldest("EUR_USD", "M5")).toBe(100);
    expect(c.newest("EUR_USD", "M5")).toBe(500);
  });

  it("de-duplicates by time, incoming wins, and reports only new bars", () => {
    const c = new CandleCache();
    expect(c.merge("EUR_USD", "M5", [bar(100), bar(200)])).toBe(2);
    expect(c.merge("EUR_USD", "M5", [bar(200, 9), bar(300), bar(300, 7)])).toBe(1);
    const all = c.get("EUR_USD", "M5");
    expect(times(all)).toEqual([100, 200, 300]);
    expect(all[1]?.close).toBe(9);
    expect(all[2]?.close).toBe(7);
  });

  it("keeps keys apart, replaces, and changes identity on every change", () => {
    const c = new CandleCache();
    c.merge("EUR_USD", "M5", [bar(100)]);
    c.merge("GBP_USD", "M5", [bar(900)]);
    c.merge("EUR_USD", "H1", [bar(700)]);
    const a = c.get("EUR_USD", "M5");
    c.merge("EUR_USD", "M5", [bar(200)]);
    expect(c.get("EUR_USD", "M5")).not.toBe(a);
    expect(times(a)).toEqual([100]);
    c.replace("EUR_USD", "M5", [bar(5)]);
    expect(times(c.get("EUR_USD", "M5"))).toEqual([5]);
    expect(times(c.get("GBP_USD", "M5"))).toEqual([900]);
    expect(c.get("USD_JPY", "M1")).toEqual([]);
    expect(c.oldest("USD_JPY", "M1")).toBeUndefined();
  });
});

describe("classifyChange", () => {
  const a = [bar(300), bar(400), bar(500)];
  it("detects prepend with the shift", () => {
    expect(classifyChange(a, [bar(100), bar(200), ...a])).toEqual({ kind: "prepend", shift: 2 });
  });
  it("detects append, same and replace", () => {
    expect(classifyChange(a, [...a, bar(600)]).kind).toBe("append");
    expect(classifyChange(a, [...a]).kind).toBe("same");
    expect(classifyChange(a, [bar(10), bar(20)]).kind).toBe("replace");
    expect(classifyChange([], a).kind).toBe("replace");
    expect(classifyChange(a, []).kind).toBe("replace");
    expect(classifyChange([], []).kind).toBe("same");
  });
});