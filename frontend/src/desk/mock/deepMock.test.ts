import { describe, expect, it } from "vitest";
import { PAIRS, TIMEFRAMES, TF_SECONDS, bucketStart } from "@/types/market";
import { runKernel } from "@/desk/kernel/kernel";
import { DEEP_MIN_BARS, DEEP_NOW, deepCandles } from "./deepMock";

describe("deepMock", () => {
  it("meets minimum depth for every TF", () => {
    for (const tf of TIMEFRAMES) expect(deepCandles("EUR_USD", tf).length).toBeGreaterThanOrEqual(DEEP_MIN_BARS[tf]);
  });
  it("is aligned, ascending, closed and sane", () => {
    for (const pair of PAIRS) for (const tf of TIMEFRAMES) {
      const c = deepCandles(pair, tf);
      const sec = TF_SECONDS[tf];
      expect(c[c.length - 1]!.time + sec).toBeLessThanOrEqual(DEEP_NOW);
      for (let i = 0; i < c.length; i++) {
        const x = c[i]!;
        expect(bucketStart(tf, x.time)).toBe(x.time);
        if (i) expect(x.time - c[i - 1]!.time).toBe(sec);
        expect(x.high).toBeGreaterThanOrEqual(Math.max(x.open, x.close));
        expect(x.low).toBeLessThanOrEqual(Math.min(x.open, x.close));
        expect(x.low).toBeGreaterThan(0);
      }
        }
  }, 60000);
  it("is deterministic and pair-specific", () => {
    const a = deepCandles("EUR_USD", "H1", { bars: 300 });
    expect(deepCandles("EUR_USD", "H1", { bars: 300 })).toEqual(a);
    expect(deepCandles("GBP_USD", "H1", { bars: 300 })).not.toEqual(a);
  });
});

describe("kernel timing (5,000 bars)", () => {
  it("runs inside the 150 ms budget", () => {
    const bars = deepCandles("EUR_USD", "M5", { bars: 5000 });
    let best = Infinity;
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now();
      runKernel(bars, { pair: "EUR_USD", tf: "M5", asOf: Infinity });
      best = Math.min(best, performance.now() - t0);
    }
    console.log(`[DK2] kernel 5000 bars: ${best.toFixed(2)} ms (best of 5)`);
    expect(best).toBeLessThan(150);
  });
});