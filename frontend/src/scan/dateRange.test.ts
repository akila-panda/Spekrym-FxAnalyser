import { clampRange, presetRange, rangeToRequest, validateRange, type DataBounds } from "./dateRange";

const sec = (d: string) => Date.parse(`${d}T12:00:00Z`) / 1000;
const bounds: DataBounds = { first: sec("2025-01-01"), last: sec("2025-06-30") };

describe("dateRange", () => {
  it("builds presets ending on the last data date", () => {
    expect(presetRange(5, bounds)).toEqual({ from: "2025-06-26", to: "2025-06-30" });
    expect(presetRange(20, bounds)).toEqual({ from: "2025-06-11", to: "2025-06-30" });
  });

  it("clamps presets to the first available date and returns null without bounds", () => {
    expect(presetRange(60, { first: sec("2025-06-20"), last: sec("2025-06-30") })?.from).toBe("2025-06-20");
    expect(presetRange(5, { first: null, last: null })).toBeNull();
  });

  it("clamps a custom range into the data", () => {
    expect(clampRange({ from: "2024-12-01", to: "2025-09-01" }, bounds)).toEqual({ from: "2025-01-01", to: "2025-06-30" });
    expect(clampRange({ from: "2025-02-01", to: "2025-03-01" }, bounds)).toEqual({ from: "2025-02-01", to: "2025-03-01" });
    expect(clampRange({ from: "nope", to: "2025-03-01" }, bounds).from).toBe("nope");
  });

  it("validates with messages that say what to do", () => {
    expect(validateRange(null, bounds)).toMatch(/Choose a date range/);
    expect(validateRange({ from: "2025-2-1", to: "2025-03-01" }, bounds)).toMatch(/YYYY-MM-DD/);
    expect(validateRange({ from: "2025-02-30", to: "2025-03-01" }, bounds)).toMatch(/YYYY-MM-DD/);
    expect(validateRange({ from: "2025-03-02", to: "2025-03-01" }, bounds)).toMatch(/Swap them/);
    expect(validateRange({ from: "2026-01-01", to: "2026-01-05" }, bounds)).toMatch(/Data runs 2025-01-01 to 2025-06-30/);
    expect(validateRange({ from: "2025-03-01", to: "2025-03-05" }, bounds)).toBeNull();
  });

  it("formats the request as inclusive UTC instants", () => {
    expect(rangeToRequest({ from: "2025-03-01", to: "2025-03-05" })).toEqual({
      from: "2025-03-01T00:00:00Z",
      to: "2025-03-05T23:59:59Z",
    });
  });
});