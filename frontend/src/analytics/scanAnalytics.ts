import type { ScanResult, Setup } from "@/types";

export interface DirStats {
  n: number;
  wins: number;
  winRate: number | null;
  expectancyR: number | null;
}

export interface Bucket {
  label: string;
  count: number;
}

export interface ScanAnalytics {
  n: number;
  wins: number;
  losses: number;
  flats: number;
  winRate: number | null;
  expectancyR: number | null;
  profitFactor: number | null;
  /** Cumulative R after each valid setup, in date order. */
  equity: number[];
  maxDrawdownR: number;
  long: DirStats;
  short: DirStats;
  histogram: Bucket[];
}

const mean = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

function dirStats(setups: Setup[], dir: "long" | "short"): DirStats {
  const rs = setups.filter((s) => s.direction === dir).map((s) => s.outcome!.r_multiple);
  const wins = rs.filter((r) => r > 0).length;
  return { n: rs.length, wins, winRate: rs.length ? wins / rs.length : null, expectancyR: mean(rs) };
}

function histogram(rs: number[]): Bucket[] {
  const edges: [string, (r: number) => boolean][] = [
    ["< -2R", (r) => r < -2],
    ["-2…-1R", (r) => r >= -2 && r < -1],
    ["-1…0R", (r) => r >= -1 && r < 0],
    ["0…1R", (r) => r >= 0 && r < 1],
    ["1…2R", (r) => r >= 1 && r < 2],
    ["≥ 2R", (r) => r >= 2],
  ];
  return edges.map(([label, test]) => ({ label, count: rs.filter(test).length }));
}

/** Derives distribution, expectancy, equity curve and drawdown from a scan's valid setups (date-ordered). */
export function analyze(result: ScanResult): ScanAnalytics {
  const valid = result.setups
    .filter((s): s is Setup & { outcome: NonNullable<Setup["outcome"]> } => s.status === "valid" && !!s.outcome)
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const rs = valid.map((s) => s.outcome.r_multiple);
  const wins = rs.filter((r) => r > 0).length;
  const losses = rs.filter((r) => r < 0).length;
  const flats = rs.filter((r) => r === 0).length;
  const grossWin = rs.filter((r) => r > 0).reduce((a, b) => a + b, 0);
  const grossLoss = rs.filter((r) => r < 0).reduce((a, b) => a + b, 0);

  let cum = 0;
  let peak = 0;
  let maxDd = 0;
  const equity = rs.map((r) => {
    cum += r;
    peak = Math.max(peak, cum);
    maxDd = Math.max(maxDd, peak - cum);
    return cum;
  });

  return {
    n: valid.length,
    wins,
    losses,
    flats,
    winRate: valid.length ? wins / valid.length : null,
    expectancyR: mean(rs),
    profitFactor: grossLoss < 0 ? grossWin / Math.abs(grossLoss) : null,
    equity,
    maxDrawdownR: maxDd,
    long: dirStats(valid, "long"),
    short: dirStats(valid, "short"),
    histogram: histogram(rs),
  };
}
