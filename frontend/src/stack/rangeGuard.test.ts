import { describe, expect, it } from "vitest";
import { createRangeGuard } from "./rangeGuard";

describe("S3 range guard (no ping-pong)", () => {
  it("ignores events fired while applying", () => {
    const g = createRangeGuard();
    let seen = false;
    g.apply(() => { seen = g.isEcho({ from: 0, to: 10 }); });
    expect(seen).toBe(true);
  });
  it("ignores a late echo matching the last applied range, within the window", () => {
    let now = 1000;
    const g = createRangeGuard(() => now);
    g.apply(() => {}, { from: 5, to: 50 });
    now += 50;
    expect(g.isEcho({ from: 5.2, to: 49.8 })).toBe(true);
  });
  it("treats a different range or an old one as user input", () => {
    let now = 1000;
    const g = createRangeGuard(() => now);
    g.apply(() => {}, { from: 5, to: 50 });
    now += 50;
    expect(g.isEcho({ from: 20, to: 70 })).toBe(false);
    now += 500;
    expect(g.isEcho({ from: 5, to: 50 })).toBe(false);
  });
  it("clears the applying flag even if the write throws", () => {
    const g = createRangeGuard();
    expect(() => g.apply(() => { throw new Error("x"); })).toThrow();
    expect(g.isEcho({ from: 1, to: 2 })).toBe(false);
  });
});