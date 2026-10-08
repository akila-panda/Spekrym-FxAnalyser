import { describe, expect, it } from "vitest";
import { formatChange, formatCrosshairTime, formatTick, resolveTz, tzShort } from "./format";

const NY_BEFORE = Date.UTC(2026, 2, 8, 6, 30) / 1000; // 01:30 EST
const NY_AFTER = Date.UTC(2026, 2, 8, 14, 0) / 1000; // 10:00 EDT

describe("format", () => {
  it("resolves time zones", () => {
    expect(resolveTz("utc")).toBe("UTC");
    expect(resolveTz("strategy", "America/New_York")).toBe("America/New_York");
    expect(resolveTz("strategy")).toBe("UTC");
    expect(resolveTz("strategy", "Not/AZone")).toBe("UTC");
    expect(resolveTz("local")).toMatch(/\S/);
  });

  it("formats crosshair and tick labels in the chosen zone, across the NY DST change", () => {
    expect(formatCrosshairTime(NY_AFTER, "UTC")).toBe("2026-03-08 14:00");
    expect(formatCrosshairTime(NY_BEFORE, "America/New_York")).toBe("2026-03-08 01:30");
    expect(formatCrosshairTime(NY_AFTER, "America/New_York")).toBe("2026-03-08 10:00");
    expect(formatTick(NY_AFTER, "time", "America/New_York")).toBe("10:00");
    expect(tzShort(NY_BEFORE, "America/New_York")).toBe("EST");
    expect(tzShort(NY_AFTER, "America/New_York")).toBe("EDT");
    expect(tzShort(NY_AFTER, "UTC")).toBe("UTC");
  });

  it("labels day, month and year ticks, falling back to clock time off local midnight", () => {
    const midnight = Date.UTC(2025, 3, 7) / 1000;
    expect(formatTick(midnight, "day", "UTC")).toBe("7");
    expect(formatTick(midnight, "month", "UTC")).toBe("Apr");
    expect(formatTick(midnight, "year", "UTC")).toBe("2025");
    expect(formatTick(midnight, "day", "America/New_York")).toBe("20:00");
  });

  it("formats change in pips and percent per pair", () => {
    expect(formatChange(1.1, 1.1012, "EUR_USD").text).toBe("+12.0p (+0.11%)");
    expect(formatChange(145, 144.9, "USD_JPY").text).toBe("-10.0p (-0.07%)");
    expect(formatChange(1, 1, "EUR_USD").text).toBe("0.0p (0.00%)");
  });
});