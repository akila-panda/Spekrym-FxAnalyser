import { describe, expect, it } from "vitest";
import { fileBase, toCsv, toJson } from "./exportScan";
import type { ScanResult, Setup } from "@/types";
import type { Timeframe } from "@/types/market";

const strategy = {
  id: "orb", name: "ORB", description: "", params: [],
  supported_timeframes: ["M5"] as Timeframe[], context_timeframes: [] as Timeframe[], display_tz: "UTC",
};
const base = {
  scan_id: "s1", timeframe: "M5" as const, strategy, params_used: {},
  summary: {
    n_valid: 1, n_rejected: 1, n_wins: 1, n_losses: 0,
    win_rate: 1, expectancy_r: 1.25, avg_win_r: 1.25, avg_loss_r: null, cost_pips_assumed: 1.6,
  },
  warnings: [],
};
const valid: Setup = {
  id: "a,1", status: "valid", direction: "long", date: "2025-05-01",
  focus: { from: 1_700_000_000, to: 1_700_003_600 }, steps: [], conditions: [], annotations: [],
  outcome: { result: "win", r_multiple: 1.25, net_pips: 8, cost_pips: 1.6, exit_reason: "target", bars_held: 6 },
};
const rejected: Setup = {
  id: "b2", status: "rejected", date: "2025-05-02",
  focus: { from: 1_700_010_000, to: 1_700_013_600 }, steps: [], conditions: [], annotations: [],
};
const result: ScanResult = { ...base, setups: [valid, rejected] };

describe("exportScan", () => {
  it("writes a header plus one row per setup", () => {
    const lines = toCsv(result).split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe(
      "setup_id,status,direction,date,focus_from,focus_to,result,r_multiple,net_pips,cost_pips,exit_reason,bars_held",
    );
  });

  it("quotes a setup id containing a comma and fills outcome columns", () => {
    const row = toCsv(result).split("\n")[1]!;
    expect(row.startsWith('"a,1",valid,long,2025-05-01,')).toBe(true);
    expect(row).toContain("win,1.25,8,1.6,target,6");
  });

  it("leaves outcome columns blank for a rejected setup", () => {
    const row = toCsv(result).split("\n")[2]!;
    expect(row).toBe("b2,rejected,,2025-05-02,2023-11-15T01:00:00.000Z,2023-11-15T02:00:00.000Z,,,,,,");
  });

  it("round-trips through JSON", () => {
    expect(JSON.parse(toJson(result)).setups).toHaveLength(2);
  });

  it("builds a filesystem-safe base name", () => {
    expect(fileBase(result)).toBe("orb_M5_s1");
  });
});
