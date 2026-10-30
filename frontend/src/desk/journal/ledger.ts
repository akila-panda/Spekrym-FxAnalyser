/** F10 — Trade-Intelligence ledger (pure). Four categories, no survival bias: executed · rejected · eligible ·
 *  counterfactual are always all listed (with zero counts shown, never hidden). Counterfactual ≠ executed — they are
 *  never blended into one performance number. Causal: a trade is knowable at its entry_time and its OUTCOME only
 *  once exit_time <= asOf; its regime link only if that snapshot was available at entry. */
import type { RegimeSnapshot, TradeRecord } from "@/intel/contracts";

export const CATEGORIES = ["executed", "rejected", "eligible", "counterfactual"] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_META: Record<Category, { label: string; glyph: string; note: string }> = {
  executed: { label: "Executed", glyph: "●", note: "Taken; real outcome." },
  rejected: { label: "Rejected", glyph: "✕", note: "Blocked by a rule; not taken." },
  eligible: { label: "Eligible", glyph: "◇", note: "Qualified but not taken." },
  counterfactual: { label: "Counterfactual", glyph: "◌", note: "Hypothetical replay; not a real result." },
};

export const isCategory = (v: unknown): v is Category => typeof v === "string" && (CATEGORIES as readonly string[]).includes(v);

export interface TradeView extends TradeRecord { closed: boolean }

/** Causal view: drops trades not yet knowable; strips outcome fields until exit_time <= asOf. */
export function viewTrades(trades: readonly TradeRecord[], asOf: number): TradeView[] {
  const out: TradeView[] = [];
  for (const t of trades) {
    if (t.entry_time > asOf) continue;
    const closed = t.exit_time !== undefined && t.exit_time <= asOf;
    if (closed) { out.push({ ...t, closed }); continue; }
    const { exit_time: _a, exit_price: _b, gross_pnl: _c, net_pnl: _d, R: _e, mfe_R: _f, mae_R: _g, exit_reason: _h, hold_min: _i, ...rest } = t;
    void [_a, _b, _c, _d, _e, _f, _g, _h, _i];
    out.push({ ...rest, closed: false, decision_trace: t.decision_trace.filter((d) => d.at <= asOf) });
  }
  return out.sort((a, b) => a.entry_time - b.entry_time || a.trade_id.localeCompare(b.trade_id));
}

export interface CategoryCount { category: Category; count: number }
/** Always returns all four categories, including zeros. */
export function countByCategory(trades: readonly TradeRecord[]): CategoryCount[] {
  return CATEGORIES.map((category) => ({ category, count: trades.filter((t) => t.category === category).length }));
}

export function filterByCategory<T extends TradeRecord>(trades: readonly T[], shown: readonly Category[]): T[] {
  const s = new Set(shown);
  return trades.filter((t) => s.has(t.category));
}

/** Honest executed-only sample note (D-floor: 30 trades before a verdict is meaningful). */
export const JUDGE_FLOOR = 30;
export function executedSample(trades: readonly TradeRecord[]): { n: number; belowFloor: boolean } {
  const n = trades.filter((t) => t.category === "executed").length;
  return { n, belowFloor: n < JUDGE_FLOOR };
}

/** The window to centre the chart on for a trade: entry → exit (or entry + 1h if still open). */
export function tradeFocusRange(t: Pick<TradeRecord, "entry_time" | "exit_time">): [number, number] {
  return [t.entry_time, t.exit_time ?? t.entry_time + 3600];
}

export type RegimeLink = { kind: "none" } | { kind: "unknown_at_entry"; id: string } | { kind: "known"; id: string; structure: string };
/** Regime at entry — only if the linked snapshot was available when the trade was entered. */
export function regimeFor(t: Pick<TradeRecord, "regime_snapshot_id" | "entry_time">, series: readonly RegimeSnapshot[]): RegimeLink {
  const id = t.regime_snapshot_id;
  if (!id) return { kind: "none" };
  const s = series.find((r) => r.id === id);
  if (!s || s.available_at > t.entry_time) return { kind: "unknown_at_entry", id };
  return { kind: "known", id, structure: s.structure_state };
}

export const fmtUtc = (t: number): string => `${new Date(t * 1000).toISOString().slice(0, 16).replace("T", " ")}Z`;