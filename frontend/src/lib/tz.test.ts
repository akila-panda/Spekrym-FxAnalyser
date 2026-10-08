import { formatInTz, isValidTz, parseHM, utcToWall, wallToUtc, windowOnDate } from "./tz";

const utc = (y: number, mo: number, d: number, h = 0, mi = 0) => Date.UTC(y, mo - 1, d, h, mi) / 1000;
const NY = "America/New_York";

describe("New York DST (2026-03-08 spring forward, 2026-11-01 fall back)", () => {
  it("10:00-11:00 NY window moves by an hour in UTC across spring forward", () => {
    expect(windowOnDate("2026-03-07", "10:00", "11:00", NY)).toEqual({ start: utc(2026, 3, 7, 15), end: utc(2026, 3, 7, 16) });
    expect(windowOnDate("2026-03-08", "10:00", "11:00", NY)).toEqual({ start: utc(2026, 3, 8, 14), end: utc(2026, 3, 8, 15) });
    expect(windowOnDate("2026-03-09", "10:00", "11:00", NY)).toEqual({ start: utc(2026, 3, 9, 14), end: utc(2026, 3, 9, 15) });
  });

  it("10:00-11:00 NY window moves by an hour in UTC across fall back", () => {
    expect(windowOnDate("2026-10-31", "10:00", "11:00", NY).start).toBe(utc(2026, 10, 31, 14));
    expect(windowOnDate("2026-11-01", "10:00", "11:00", NY).start).toBe(utc(2026, 11, 1, 15));
    expect(windowOnDate("2026-11-02", "10:00", "11:00", NY).start).toBe(utc(2026, 11, 2, 15));
  });

  it("local days are 23h and 25h long on transition days", () => {
    const day = (date: string) => windowOnDate(date, "00:00", "00:00", NY);
    const spring = day("2026-03-08");
    const fall = day("2026-11-01");
    expect((spring.end - spring.start) / 3600).toBe(23);
    expect((fall.end - fall.start) / 3600).toBe(25);
  });

  it("a window crossing midnight ends on the next day", () => {
    const w = windowOnDate("2026-03-07", "22:00", "02:00", NY);
    expect((w.end - w.start) / 3600).toBe(4);
  });

  it("nonexistent 02:30 on 2026-03-08 resolves to after the gap (03:30 EDT)", () => {
    const t = wallToUtc({ year: 2026, month: 3, day: 8, hour: 2, minute: 30 }, NY);
    expect(t).toBe(utc(2026, 3, 8, 7, 30));
    expect(utcToWall(t, NY)).toMatchObject({ hour: 3, minute: 30 });
  });

  it("ambiguous 01:30 on 2026-11-01 resolves to the first occurrence (EDT)", () => {
    expect(wallToUtc({ year: 2026, month: 11, day: 1, hour: 1, minute: 30 }, NY)).toBe(utc(2026, 11, 1, 5, 30));
  });

  it("round-trips every hour around both transitions", () => {
    for (const start of [utc(2026, 3, 7, 12), utc(2026, 10, 31, 12)]) {
      for (let h = 0; h < 72; h++) {
        const t = start + h * 3600;
        const w = utcToWall(t, NY);
        const back = wallToUtc(w, NY);
        // ambiguous hour maps back to the first occurrence only
        const ambiguous = t >= utc(2026, 11, 1, 6) && t < utc(2026, 11, 1, 7);
        expect(back).toBe(ambiguous ? t - 3600 : t);
      }
    }
  });
});

describe("other zones and formatting", () => {
  it("Asia/Colombo has no DST (UTC+5:30)", () => {
    expect(wallToUtc({ year: 2026, month: 6, day: 1, hour: 12, minute: 0 }, "Asia/Colombo")).toBe(utc(2026, 6, 1, 6, 30));
  });
  it("formatInTz", () => {
    expect(formatInTz(utc(2026, 3, 8, 14), NY)).toBe("2026-03-08 10:00");
    expect(formatInTz(utc(2026, 3, 7, 14), NY)).toBe("2026-03-07 09:00");
    expect(formatInTz(utc(2026, 1, 1, 0), "UTC", true)).toBe("2026-01-01 00:00:00");
  });
  it("validates zones and HH:MM", () => {
    expect(isValidTz("America/New_York")).toBe(true);
    expect(isValidTz("Mars/Olympus")).toBe(false);
    expect(parseHM("07:05")).toEqual({ hour: 7, minute: 5 });
    expect(() => parseHM("7:5")).toThrow();
  });
});