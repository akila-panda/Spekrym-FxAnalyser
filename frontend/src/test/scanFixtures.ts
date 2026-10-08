import scanFixture from "@/test/fixtures/scanResult.json";
import { parseScanResult, type ScanResult, type Setup } from "@/types";
import type { Timeframe } from "@/types/market";

export const baseScan = parseScanResult(scanFixture);
export const baseValid = baseScan.setups.find((s) => s.status === "valid")!;
export const baseRejected = baseScan.setups.find((s) => s.status === "rejected")!;

const DAY = 86400;

/** A valid setup shifted by `days`, with chosen result and R. Annotations are shifted with it. */
export function validSetup(id: string, days: number, r: number, direction: "long" | "short" = "long"): Setup {
  const shift = days * DAY;
  const result = r > 0 ? "win" : r < 0 ? "loss" : "flat";
  const date = new Date((baseValid.focus.from + shift) * 1000).toISOString().slice(0, 10);
  return {
    ...baseValid,
    id, date, direction,
    focus: { from: baseValid.focus.from + shift, to: baseValid.focus.to + shift },
    steps: baseValid.steps.map((s) => ({ ...s, known_at: s.known_at + shift })),
    annotations: baseValid.annotations.map((a) => ({ ...a, id: `${id}:${a.id}`, known_at: a.known_at + shift })) as Setup["annotations"],
    outcome: { ...baseValid.outcome!, result, r_multiple: r },
  };
}

export function rejectedSetup(id: string, days: number): Setup {
  const shift = days * DAY;
  const date = new Date((baseRejected.focus.from + shift) * 1000).toISOString().slice(0, 10);
  return {
    ...baseRejected,
    id, date,
    focus: { from: baseRejected.focus.from + shift, to: baseRejected.focus.to + shift },
    steps: [], annotations: [],
  };
}

export function scanOf(tf: Timeframe, setups: Setup[], expectancy: number | null = 0.42): ScanResult {
  const valid = setups.filter((s) => s.status === "valid");
  return {
    ...baseScan,
    scan_id: `scan-${tf}`,
    timeframe: tf,
    setups,
    summary: {
      ...baseScan.summary,
      n_valid: valid.length,
      n_rejected: setups.length - valid.length,
      expectancy_r: expectancy,
      win_rate: valid.length ? valid.filter((s) => s.outcome?.result === "win").length / valid.length : null,
    },
  };
}