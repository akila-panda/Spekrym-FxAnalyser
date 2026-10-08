import { floorTo, parseBackendTs, toIsoUtc, utcDateString } from "./time";

const utc = (y: number, mo: number, d: number, h = 0, mi = 0, s = 0) => Date.UTC(y, mo - 1, d, h, mi, s) / 1000;

describe("parseBackendTs", () => {
  it("parses Python-style strings (space separator, +00:00)", () => {
    expect(parseBackendTs("2025-05-07 17:00:00+00:00")).toBe(utc(2025, 5, 7, 17));
  });
  it("parses ISO with T and Z", () => {
    expect(parseBackendTs("2025-05-07T17:00:00Z")).toBe(utc(2025, 5, 7, 17));
  });
  it("applies non-zero offsets", () => {
    expect(parseBackendTs("2025-05-07 17:00:00+05:30")).toBe(utc(2025, 5, 7, 11, 30));
    expect(parseBackendTs("2025-05-07 17:00:00-0400")).toBe(utc(2025, 5, 7, 21));
  });
  it("drops fractional seconds, including microseconds", () => {
    expect(parseBackendTs("2025-05-07 17:00:00.123456+00:00")).toBe(utc(2025, 5, 7, 17));
  });
  it("treats naive strings as UTC", () => {
    expect(parseBackendTs("2025-05-07 17:00:00")).toBe(utc(2025, 5, 7, 17));
  });
  it("rejects garbage and impossible dates", () => {
    expect(() => parseBackendTs("yesterday")).toThrow(/Invalid backend timestamp/);
    expect(() => parseBackendTs("2025-02-30 10:00:00+00:00")).toThrow(/Invalid backend timestamp/);
    expect(() => parseBackendTs("2025-05-07 25:00:00+00:00")).toThrow(/Invalid backend timestamp/);
  });
});

describe("helpers", () => {
  it("round-trips through toIsoUtc", () => {
    const t = utc(2025, 5, 7, 17, 5, 9);
    expect(toIsoUtc(t)).toBe("2025-05-07T17:05:09Z");
    expect(parseBackendTs(toIsoUtc(t))).toBe(t);
  });
  it("utcDateString and floorTo", () => {
    expect(utcDateString(utc(2025, 5, 7, 23, 59))).toBe("2025-05-07");
    expect(floorTo(utc(2025, 5, 7, 17, 44, 10), 900)).toBe(utc(2025, 5, 7, 17, 30));
  });
});