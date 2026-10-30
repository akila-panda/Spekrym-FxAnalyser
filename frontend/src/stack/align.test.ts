import { describe, expect, it } from "vitest";
import { TF_SECONDS, type Candle, type Timeframe } from "@/types/market";
import { calendarSpan, countChildren, parentSpans, spanAt } from "./align";

const bar = (time: number): Candle => ({ time, open: 1, high: 1, low: 1, close: 1, volume: 1 });
const run = (tf: Timeframe, start: number, n: number): Candle[] => Array.from({ length: n }, (_, i) => bar(start + i * TF_SECONDS[tf]));
const T0 = Date.UTC(2025, 3, 7, 0, 0, 0) / 1000; // Mon 00:00 UTC

describe("S2 alignment", () => {
  it("H1 contains 12 x M5, half-open", () => {
    const h1 = run("H1", T0, 4);
    const m5 = run("M5", T0, 48);
    const s = spanAt("H1", h1, T0 + 3600 + 600)!;
    expect(s.open).toBe(T0 + 3600);
    expect(s.close).toBe(T0 + 7200);
    expect(countChildren(s, "M5", m5)).toEqual({ present: 12, expected: 12, partial: false });
    expect(spanAt("H1", h1, T0 + 7200)!.open).toBe(T0 + 7200); // boundary belongs to the next parent
    expect(spanAt("H1", h1, T0 + 7199)!.open).toBe(T0 + 3600);
  });

  it("marks a parent with missing children as partial", () => {
    const h1 = run("H1", T0, 1);
    const m5 = run("M5", T0, 12).filter((_, i) => i !== 3 && i !== 4);
    expect(countChildren(spanAt("H1", h1, T0)!, "M5", m5)).toEqual({ present: 10, expected: 12, partial: true });
  });

  it("DST spring: a 23h D parent holds 23 H1", () => {
    const d0 = T0;
    const d = [bar(d0), bar(d0 + 23 * 3600), bar(d0 + 47 * 3600)];
    const s = spanAt("D", d, d0 + 3600)!;
    expect(s.close - s.open).toBe(23 * 3600);
    expect(countChildren(s, "H1", run("H1", d0, 47))).toEqual({ present: 23, expected: 23, partial: false });
  });

  it("DST fall: a 25h D parent is honoured (within slack)", () => {
    const d = [bar(T0), bar(T0 + 25 * 3600)];
    const s = spanAt("D", d, T0 + 24 * 3600 + 60)!;
    expect(s.close).toBe(T0 + 25 * 3600);
    expect(countChildren(s, "H1", run("H1", T0, 50))).toEqual({ present: 25, expected: 25, partial: false });
  });

  it("weekend gap: no parent covers the gap; spans never stretch across it", () => {
    const fri = Date.UTC(2025, 3, 11, 20, 0, 0) / 1000;
    const sun = Date.UTC(2025, 3, 13, 22, 0, 0) / 1000;
    const h4 = [bar(fri), bar(sun)];
    const s = spanAt("H4", h4, fri + 600)!;
    expect(s.close).toBe(fri + 14400);
    expect(spanAt("H4", h4, fri + 14400 + 1)).toBeNull();
    expect(spanAt("H4", h4, sun)!.open).toBe(sun);
  });

  it("forming parent: counts only closed children at asOf", () => {
    const h1 = run("H1", T0, 1);
    const m5 = run("M5", T0, 12);
    const asOf = T0 + 1500; // 25 min in: 5 M5 closed
    const s = spanAt("H1", h1, T0 + 600, asOf)!;
    expect(s.forming).toBe(true);
    expect(countChildren(s, "M5", m5, asOf)).toEqual({ present: 5, expected: 12, partial: true });
    expect(spanAt("H1", h1, T0 + 600, T0 + 3600)!.forming).toBe(false);
  });

  it("parentSpans returns overlapping spans, ascending, and honours the cap", () => {
    const h1 = run("H1", T0, 10);
    const all = parentSpans("H1", h1, T0 + 1800, T0 + 4 * 3600);
    expect(all.map((s) => s.open)).toEqual([T0, T0 + 3600, T0 + 7200, T0 + 10800]);
    expect(parentSpans("H1", h1, T0, T0 + 10 * 3600, null, 3).map((s) => s.open)).toEqual([T0 + 7 * 3600, T0 + 8 * 3600, T0 + 9 * 3600]);
    expect(parentSpans("H1", h1, T0 + 5, T0 + 5)).toEqual([]);
  });

  it("calendar fallback only when there are no parent bars", () => {
    const s = spanAt("H1", [], T0 + 4000)!;
    expect(s.calendar).toBe(true);
    expect(s.open).toBe(T0 + 3600);
    expect(spanAt("H1", run("H1", T0, 2), T0 + 100)!.calendar).toBe(false);
    expect(calendarSpan("D", T0).open % 86400).toBe(79200);
  });
});