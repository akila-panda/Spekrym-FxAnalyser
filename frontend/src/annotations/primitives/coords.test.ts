import { clampSpan, lastIndexAtOrBefore, makeCoordinates, timeToLogical } from "./coords";

const H1 = 3600;
const bars = [0, 1, 2, 3].map((i) => ({ time: 1_000_000 + i * H1 }));
const T0 = bars[0]!.time;

describe("lastIndexAtOrBefore", () => {
  it("binary searches", () => {
    expect(lastIndexAtOrBefore(bars, T0 - 1)).toBe(-1);
    expect(lastIndexAtOrBefore(bars, T0)).toBe(0);
    expect(lastIndexAtOrBefore(bars, T0 + H1 + 5)).toBe(1);
    expect(lastIndexAtOrBefore(bars, T0 + 10 * H1)).toBe(3);
    expect(lastIndexAtOrBefore([], 5)).toBe(-1);
  });
});

describe("timeToLogical", () => {
  it("maps bar open times to integer indices", () => {
    expect(timeToLogical(T0 + 2 * H1, bars, H1)).toBe(2);
  });
  it("gives a zone inside one bar a defined, non-zero x-range", () => {
    const a = timeToLogical(T0 + H1 + 900, bars, H1)!;
    const b = timeToLogical(T0 + H1 + 2700, bars, H1)!;
    expect(a).toBeCloseTo(1.25);
    expect(b).toBeCloseTo(1.75);
    expect(b - a).toBeGreaterThan(0);
  });
  it("extrapolates before the first bar", () => {
    expect(timeToLogical(T0 - 2 * H1, bars, H1)).toBe(-2);
  });
  it("extrapolates after the last bar", () => {
    expect(timeToLogical(T0 + 3 * H1 + 5 * H1, bars, H1)).toBe(8);
  });
  it("caps the fraction across a data gap at the next bar", () => {
    const gap = [{ time: 0 }, { time: 10 * H1 }];
    expect(timeToLogical(5 * H1, gap, H1)).toBe(1);
  });
  it("returns null with no bars", () => {
    expect(timeToLogical(5, [], H1)).toBeNull();
  });
});

describe("clampSpan", () => {
  it("clamps partly visible spans to the pane", () => {
    expect(clampSpan(-50, 30, 0, 100)).toEqual({ start: 0, end: 30 });
    expect(clampSpan(80, 300, 0, 100)).toEqual({ start: 80, end: 100 });
    expect(clampSpan(-20, 300, 0, 100)).toEqual({ start: 0, end: 100 });
  });
  it("accepts reversed input and rejects spans fully outside", () => {
    expect(clampSpan(30, 10, 0, 100)).toEqual({ start: 10, end: 30 });
    expect(clampSpan(-30, -10, 0, 100)).toBeNull();
    expect(clampSpan(110, 200, 0, 100)).toBeNull();
  });
});

describe("makeCoordinates", () => {
  const ts = { logicalToCoordinate: (l: number) => l * 10 + 5 };
  const series = { priceToCoordinate: (p: number) => 100 - p };
  it("converts time via the logical index and price via the series", () => {
    const c = makeCoordinates(ts as never, series, () => bars, H1);
    expect(c.timeX(T0 + H1)).toBe(15);
    expect(c.timeX(T0 + 3 * H1 + 2 * H1)).toBe(55);
    expect(c.priceY(40)).toBe(60);
  });
  it("interpolates intrabar and forward times when the chart rejects fractional indexes", () => {
    const integerOnly = { logicalToCoordinate: (l: number) => Number.isInteger(l) ? l * 10 + 5 : 0 };
    const c = makeCoordinates(integerOnly as never, series, () => bars, H1);
    expect(c.timeX(T0 + H1 * 1.25)).toBe(17.5);
    expect(c.timeX(T0 + H1 * 5.5)).toBe(60);
  });
  it("is null with no bars", () => {
    expect(makeCoordinates(ts as never, series, () => [], H1).timeX(1)).toBeNull();
  });
});