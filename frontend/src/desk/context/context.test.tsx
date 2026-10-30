import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { deepCandles, DEEP_NOW } from "@/desk/mock/deepMock";
import { createMockDeskSource } from "@/desk/source/mockDeskSource";
import type { DeskEvent } from "@/desk/source/deskSource";
import { calendarView, highImpactSoon } from "./calendar";
import { CalendarBody, SessionsBody, VolatilityBody } from "./ContextWidgets";
import { dstShiftHours, sessionClock, sessionWindow } from "./sessions";
import { volatility } from "./volatility";

const D = (s: string) => Date.parse(`${s}T00:00:00Z`) / 1000;
const H = 3600;

describe("sessions (DST-aware)", () => {
  it("summer windows equal the OQ-7 UTC defaults", () => {
    const d = D("2025-07-09");
    expect(sessionWindow("asia", d)).toEqual({ open: d, close: d + 8 * H });
    expect(sessionWindow("london", d)).toEqual({ open: d + 7 * H, close: d + 16 * H });
    expect(sessionWindow("ny", d)).toEqual({ open: d + 12 * H, close: d + 21 * H });
  });
  it("winter shifts London/NY by one hour, Asia never", () => {
    const d = D("2025-01-15");
    expect(sessionWindow("london", d).open).toBe(d + 8 * H);
    expect(sessionWindow("ny", d).open).toBe(d + 13 * H);
    expect(dstShiftHours("asia", d)).toBe(0);
    expect(dstShiftHours("london", d)).toBe(1);
    expect(dstShiftHours("london", D("2025-07-09"))).toBe(0);
  });
  it("US/UK DST mismatch weeks differ", () => {
    const d = D("2025-03-20"); // US already on DST (from Mar 9), UK not yet (Mar 30)
    expect(dstShiftHours("ny", d)).toBe(0);
    expect(dstShiftHours("london", d)).toBe(1);
  });
  it("clock: open / upcoming / closed and overlap", () => {
    const d = D("2025-07-09");
    const c = sessionClock(d + 13 * H);
    const st = Object.fromEntries(c.rows.map((r) => [r.name, r.status]));
    expect(st).toEqual({ asia: "upcoming", london: "open", ny: "open" });
    expect(c.overlaps).toEqual(["London + NY overlap"]);
    expect(c.rows.find((r) => r.name === "london")!.changeIn).toBe(3 * H);
    expect(sessionClock(d + 6 * H).rows.find((r) => r.name === "london")!.status).toBe("upcoming");
  });
});

const ev = (o: Partial<DeskEvent>): DeskEvent => ({ id: "x", time: 1000, title: "CPI", impact: "high", currency: "USD", ...o });

describe("calendar", () => {
  const now = 100_000;
  it("hides actual until released; flags the pair's currencies", () => {
    const rows = calendarView([ev({ id: "a", time: now + 600, actual: 3 }), ev({ id: "b", time: now - 600, actual: 4, currency: "JPY" })], now, "EUR_USD");
    expect(rows[0]).toMatchObject({ id: "b", state: "released", actual: 4, relevant: false });
    expect(rows[1]!.actual).toBeUndefined();
    expect(rows[1]).toMatchObject({ state: "upcoming", relevant: true });
  });
  it("window is −2 h … +24 h", () => {
    expect(calendarView([ev({ time: now - 3 * H }), ev({ id: "y", time: now + 25 * H })], now, "EUR_USD")).toEqual([]);
  });
  it("high-impact-soon: only high, within 30 min, pair currencies", () => {
    expect(highImpactSoon([ev({ time: now + 25 * 60 })], now, "EUR_USD")?.id).toBe("x");
    expect(highImpactSoon([ev({ time: now + 31 * 60 })], now, "EUR_USD")).toBeNull();
    expect(highImpactSoon([ev({ time: now + 60, impact: "med" })], now, "EUR_USD")).toBeNull();
    expect(highImpactSoon([ev({ time: now + 60, currency: "JPY" })], now, "EUR_USD")).toBeNull();
    expect(highImpactSoon([ev({ time: now - 10 * 60 })], now, "EUR_USD")).not.toBeNull();
  });
});

describe("volatility", () => {
  const daily = deepCandles("EUR_USD", "D");
  const h1 = deepCandles("EUR_USD", "H1");
  it("ADR in pips from closed bars; no lookahead", () => {
    const v = volatility("EUR_USD", daily, h1, DEEP_NOW);
    expect(v.adrPips).toBeGreaterThan(0);
    const early = volatility("EUR_USD", daily, h1, daily[5]!.time + 100);
    expect(early.adrPips).toBeNull();
    const prefix = daily.filter((c) => c.time + 86400 <= DEEP_NOW);
    expect(volatility("EUR_USD", prefix, h1, DEEP_NOW).adrPips).toBe(v.adrPips);
  });
});

describe("widgets", () => {
  it("calendar shows sample + events; sessions show approximate; volatility shows pips", async () => {
    render(<CalendarBody />);
    expect(await screen.findByRole("list", { name: "Economic calendar" })).toBeTruthy();
    expect(screen.getByText("sample")).toBeTruthy();
    render(<SessionsBody />);
    await waitFor(() => expect(screen.getByRole("list", { name: "Session clock" })).toBeTruthy());
    expect(screen.getByText(/Approximate/)).toBeTruthy();
    render(<VolatilityBody />);
    await waitFor(() => expect(screen.getByRole("list", { name: "ADR and volatility" }).textContent).toMatch(/pips/));
  });
  it("missing scenario: calendar absent", async () => {
    const caps = await createMockDeskSource({ scenario: "missing" }).capabilities();
    expect(caps.data.calendar).toBe("absent");
  });
});