import { describe, expect, it } from "vitest";
import { analyze } from "./scanAnalytics";
import type { ScanResult, Setup } from "@/types";
import type { Timeframe } from "@/types/market";

const strategy = {
  id: "orb", name: "ORB", description: "", params: [],
  supported_timeframes: ["M5"] as Timeframe[], context_timeframes: [] as Timeframe[], display_tz: "UTC",
};
const summary = {
  n_valid: 0, n_rejected: 0, n_wins: 0, n_losses: 0,
  win_rate: null, expectancy_r: null, avg_win_r: null, avg_loss_r: null, cost_pips_assumed: 1.6,
};

let id = 0;
const valid = (date: string, dir: "long" | "short", r: number): Setup => ({
  id: `s${id++}`, status: "valid", direction: dir, date,
  focus: { from: 1_700_000_000, to: 1_700_003_600 }, steps: [], conditions: [], annotations: [],
  outcome: { result: r > 0 ? "win" : r < 0 ? "loss" : "flat", r_multiple: r, net_pips: r * 10, cost_pips: 1.6, exit_reason: "x", bars_held: 3 },
});
const rejected = (date: string): Setup => ({
  id: `r${id++}`, status: "rejected", date,
  focus: { from: 1_700_000_000, to: 1_700_003_600 }, steps: [], conditions: [], annotations: [],
});
const result = (setups: Setup[]): ScanResult => ({
  scan_id: "s", timeframe: "M5", strategy, params_used: {}, setups, summary, warnings: [],
});

describe("analyze", () => {
  it("counts only valid setups and computes win rate + expectancy", () => {
    const a = analyze(result([valid("2025-01-02", "long", 2), valid("2025-01-03", "short", -1), rejected("2025-01-04")]));
    expect(a.n).toBe(2);
    expect(a.wins).toBe(1);
    expect(a.losses).toBe(1);
    expect(a.winRate).toBe(0.5);
    expect(a.expectancyR).toBeCloseTo(0.5);
  });

  it("builds a date-ordered cumulative equity curve and max drawdown", () => {
    const a = analyze(result([valid("2025-01-03", "long", -1), valid("2025-01-01", "long", 2), valid("2025-01-02", "long", -1)]));
    expect(a.equity).toEqual([2, 1, 0]); // sorted: +2, -1, -1
    expect(a.maxDrawdownR).toBe(2);
  });

  it("computes profit factor, null when there are no losses", () => {
    expect(analyze(result([valid("2025-01-01", "long", 2), valid("2025-01-02", "long", -1)])).profitFactor).toBeCloseTo(2);
    expect(analyze(result([valid("2025-01-01", "long", 2)])).profitFactor).toBeNull();
  });

  it("splits stats by direction", () => {
    const a = analyze(result([valid("2025-01-01", "long", 2), valid("2025-01-02", "short", -1)]));
    expect(a.long).toEqual({ n: 1, wins: 1, winRate: 1, expectancyR: 2 });
    expect(a.short).toEqual({ n: 1, wins: 0, winRate: 0, expectancyR: -1 });
  });

  it("bins the R histogram", () => {
    const a = analyze(result([valid("2025-01-01", "long", 2.5), valid("2025-01-02", "long", 0.5), valid("2025-01-03", "long", -1.5)]));
    expect(a.histogram.find((b) => b.label === "≥ 2R")?.count).toBe(1);
    expect(a.histogram.find((b) => b.label === "0…1R")?.count).toBe(1);
    expect(a.histogram.find((b) => b.label === "-2…-1R")?.count).toBe(1);
  });

  it("returns zeros for an empty scan", () => {
    const a = analyze(result([]));
    expect(a.n).toBe(0);
    expect(a.winRate).toBeNull();
    expect(a.equity).toEqual([]);
  });
});
