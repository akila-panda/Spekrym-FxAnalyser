import { formatPips, formatPrice, fromPips, pipSize, toPips } from "./pips";
import { gaussian, mulberry32 } from "./rng";

describe("pips", () => {
  it("uses 0.01 for JPY pairs and 0.0001 otherwise", () => {
    expect(pipSize("USD_JPY")).toBe(0.01);
    expect(pipSize("EUR_USD")).toBe(0.0001);
  });
  it("converts and formats", () => {
    expect(toPips(0.0013, "EUR_USD")).toBeCloseTo(13, 6);
    expect(fromPips(5, "USD_JPY")).toBeCloseTo(0.05, 10);
    expect(formatPrice(1.1, "EUR_USD")).toBe("1.10000");
    expect(formatPrice(150.1, "USD_JPY")).toBe("150.100");
    expect(formatPips(13.4)).toBe("+13.4p");
    expect(formatPips(-2)).toBe("-2.0p");
  });
});

describe("rng", () => {
  it("is deterministic for a fixed seed and within [0,1)", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const xs = Array.from({ length: 100 }, () => a());
    expect(xs).toEqual(Array.from({ length: 100 }, () => b()));
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(mulberry32(43)()).not.toBe(xs[0]);
  });
  it("gaussian has roughly zero mean and unit variance", () => {
    const r = mulberry32(7);
    const xs = Array.from({ length: 5000 }, () => gaussian(r));
    const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
    const variance = xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length;
    expect(Math.abs(mean)).toBeLessThan(0.1);
    expect(variance).toBeGreaterThan(0.9);
    expect(variance).toBeLessThan(1.1);
  });
});