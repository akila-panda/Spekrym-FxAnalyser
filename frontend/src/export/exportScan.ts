import type { ScanResult } from "@/types";

const iso = (sec: number): string => new Date(sec * 1000).toISOString();
const cell = (v: unknown): string => {
  const s = v === undefined || v === null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Neutralises spreadsheet formula injection in free text. */
const safeText = (s: string): string => (/^[=+\-@\t\r]/.test(s) ? `'${s}` : s);

export interface ReviewCsv {
  mark?: string;
  note?: string;
}

const COLUMNS = [
  "setup_id", "status", "direction", "date", "focus_from", "focus_to",
  "result", "r_multiple", "net_pips", "cost_pips", "exit_reason", "bars_held",
] as const;

/**
 * One row per setup; valid setups carry outcome fields, rejected ones leave them blank.
 * With `review`, appends `review` and `note` columns (human review, not strategy result).
 */
export function toCsv(result: ScanResult, review?: (setupId: string) => ReviewCsv | undefined): string {
  const header = review ? [...COLUMNS, "review", "note"] : [...COLUMNS];
  const rows = result.setups.map((s) => {
    const cols: unknown[] = [
      s.id, s.status, s.direction ?? "", s.date, iso(s.focus.from), iso(s.focus.to),
      s.outcome?.result ?? "", s.outcome?.r_multiple ?? "", s.outcome?.net_pips ?? "",
      s.outcome?.cost_pips ?? "", s.outcome?.exit_reason ?? "", s.outcome?.bars_held ?? "",
    ];
    if (review) {
      const r = review(s.id);
      cols.push(r?.mark ?? "", safeText(r?.note ?? ""));
    }
    return cols.map(cell).join(",");
  });
  return [header.join(","), ...rows].join("\n");
}

/** Full scan result as pretty JSON (setups, summary, params, warnings). */
export function toJson(result: ScanResult): string {
  return JSON.stringify(result, null, 2);
}

/** Stable, filesystem-safe base name: strategy_timeframe_scanid. */
export function fileBase(result: ScanResult): string {
  return `${result.strategy.id}_${result.timeframe}_${result.scan_id}`.replace(/[^\w.-]+/g, "-");
}