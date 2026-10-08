import type { ScanResult } from "@/types";

const iso = (sec: number): string => new Date(sec * 1000).toISOString();
const cell = (v: unknown): string => {
  const s = v === undefined || v === null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const COLUMNS = [
  "setup_id", "status", "direction", "date", "focus_from", "focus_to",
  "result", "r_multiple", "net_pips", "cost_pips", "exit_reason", "bars_held",
] as const;

/** One row per setup; valid setups carry outcome fields, rejected ones leave them blank. */
export function toCsv(result: ScanResult): string {
  const rows = result.setups.map((s) =>
    [
      s.id, s.status, s.direction ?? "", s.date, iso(s.focus.from), iso(s.focus.to),
      s.outcome?.result ?? "", s.outcome?.r_multiple ?? "", s.outcome?.net_pips ?? "",
      s.outcome?.cost_pips ?? "", s.outcome?.exit_reason ?? "", s.outcome?.bars_held ?? "",
    ].map(cell).join(","),
  );
  return [COLUMNS.join(","), ...rows].join("\n");
}

/** Full scan result as pretty JSON (setups, summary, params, warnings). */
export function toJson(result: ScanResult): string {
  return JSON.stringify(result, null, 2);
}

/** Stable, filesystem-safe base name: strategy_timeframe_scanid. */
export function fileBase(result: ScanResult): string {
  return `${result.strategy.id}_${result.timeframe}_${result.scan_id}`.replace(/[^\w.-]+/g, "-");
}
