import { PANEL_ORDER, type Timeframe } from "@/types/market";
import type { ScanResult, Setup, Step } from "@/types";

export type Tab = Timeframe | "all";
export const TABS: readonly Tab[] = [...PANEL_ORDER, "all"];

export type DirectionFilter = "all" | "long" | "short";
export type OutcomeFilter = "all" | "win" | "loss" | "flat";
export type SortKey = "date_asc" | "date_desc" | "r_desc" | "r_asc";

export interface SetupFilters {
  /** Rejected candidates are hidden unless this is on. */
  showRejected: boolean;
  direction: DirectionFilter;
  outcome: OutcomeFilter;
  /** YYYY-MM-DD, inclusive. Empty = open. */
  from: string;
  to: string;
  sort: SortKey;
}

export const DEFAULT_FILTERS: SetupFilters = {
  showRejected: false, direction: "all", outcome: "all", from: "", to: "", sort: "date_asc",
};

/** Fewer valid setups than this and the strip says so plainly. */
export const MIN_SETUPS = 30;

interface PanelLike {
  status: string;
  stale: boolean;
  result?: ScanResult;
}
export type PanelsLike = Record<Timeframe, PanelLike>;

export interface SetupRow {
  key: string;
  tf: Timeframe;
  setup: Setup;
}

export const rowKey = (tf: Timeframe, id: string): string => `${tf}:${id}`;

export function filtersChanged(f: SetupFilters): boolean {
  return (Object.keys(DEFAULT_FILTERS) as (keyof SetupFilters)[]).some((k) => f[k] !== DEFAULT_FILTERS[k]);
}

export function filterSetups(rows: readonly SetupRow[], f: SetupFilters): SetupRow[] {
  return rows.filter(({ setup: s }) => {
    if (s.status === "rejected" && !f.showRejected) return false;
    if (f.direction !== "all" && s.direction !== f.direction) return false;
    if (f.outcome !== "all" && s.outcome?.result !== f.outcome) return false;
    if (f.from && s.date < f.from) return false;
    if (f.to && s.date > f.to) return false;
    return true;
  });
}

const tfIndex = (tf: Timeframe) => PANEL_ORDER.indexOf(tf);

/** Stable order: the chosen key, then date, time, timeframe (top-down), id. Rejected go last in R sorts. */
export function sortRows(rows: readonly SetupRow[], sort: SortKey): SetupRow[] {
  const byDate = (a: SetupRow, b: SetupRow) =>
    a.setup.date.localeCompare(b.setup.date) ||
    a.setup.focus.from - b.setup.focus.from ||
    tfIndex(a.tf) - tfIndex(b.tf) ||
    a.setup.id.localeCompare(b.setup.id);
  const cmp = (a: SetupRow, b: SetupRow): number => {
    if (sort === "date_asc") return byDate(a, b);
    if (sort === "date_desc") return -byDate(a, b) || 0;
    const ra = a.setup.outcome?.r_multiple;
    const rb = b.setup.outcome?.r_multiple;
    if (ra === undefined || rb === undefined) {
      if (ra === rb) return byDate(a, b);
      return ra === undefined ? 1 : -1;
    }
    return (sort === "r_desc" ? rb - ra : ra - rb) || byDate(a, b);
  };
  return [...rows].sort(cmp);
}

/** Rows for a tab. "all" merges every scanned timeframe; each row keeps its own timeframe. */
export function rowsFor(panels: PanelsLike, tab: Tab, f: SetupFilters): SetupRow[] {
  const tfs = tab === "all" ? PANEL_ORDER : [tab];
  const rows: SetupRow[] = [];
  for (const tf of tfs) {
    for (const setup of panels[tf].result?.setups ?? []) rows.push({ key: rowKey(tf, setup.id), tf, setup });
  }
  return sortRows(filterSetups(rows, f), f.sort);
}

/** Counts shown on the tabs: what each tab would list with the current filters. */
export function tabCounts(panels: PanelsLike, f: SetupFilters): Record<Tab, number> {
  const out = {} as Record<Tab, number>;
  for (const t of TABS) out[t] = rowsFor(panels, t, f).length;
  return out;
}

export interface TfSummary {
  tf: Timeframe;
  status: string;
  stale: boolean;
  n_valid: number;
  n_rejected: number;
  expectancy_r: number | null;
  win_rate: number | null;
  cost_pips: number;
  warnings: readonly string[];
  tooFew: boolean;
}

/** Summary of one timeframe's own scan. There is deliberately no function that adds timeframes together:
 *  scans on different timeframes overlap, so a combined total would double count. */
export function tfSummary(panels: PanelsLike, tf: Timeframe): TfSummary | null {
  const p = panels[tf];
  if (!p.result) return null;
  const s = p.result.summary;
  return {
    tf, status: p.status, stale: p.stale, n_valid: s.n_valid, n_rejected: s.n_rejected,
    expectancy_r: s.expectancy_r, win_rate: s.win_rate, cost_pips: s.cost_pips_assumed,
    warnings: p.result.warnings, tooFew: s.n_valid < MIN_SETUPS,
  };
}

export const allSummaries = (panels: PanelsLike): TfSummary[] =>
  PANEL_ORDER.flatMap((tf) => {
    const s = tfSummary(panels, tf);
    return s ? [s] : [];
  });

/** Next (1) or previous (-1) row. Clamped at the ends. With no current row, 1 gives the first and -1 the last. */
export function neighbor(rows: readonly SetupRow[], currentKey: string | null, dir: 1 | -1): SetupRow | null {
  if (rows.length === 0) return null;
  const i = currentKey === null ? -1 : rows.findIndex((r) => r.key === currentKey);
  if (i < 0) return (dir === 1 ? rows[0] : rows[rows.length - 1]) ?? null;
  return rows[i + dir] ?? null;
}

/** Steps replay positions are [all, 1..n], cycling. Returns the step number, or null for "all steps". */
export function stepNeighbor(steps: readonly Step[], step: number | null, dir: 1 | -1): number | null {
  const positions: (number | null)[] = [null, ...steps.map((s) => s.n)];
  const i = Math.max(0, positions.indexOf(step));
  return positions[(i + dir + positions.length) % positions.length] ?? null;
}

export function formatR(r: number): string {
  const sign = r > 0 ? "+" : r < 0 ? "−" : "";
  return `${sign}${Math.abs(r).toFixed(2)}R`;
}
export const formatPct = (x: number): string => `${Math.round(x * 100)}%`;