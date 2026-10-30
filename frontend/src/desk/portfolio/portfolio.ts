/** F17 — Portfolio Command view (pure, read-only, causal). Observe-only (D6): shadow, no orders, no allocation edits.
 *  A SafetyVeto / kill switch overrides any EligibilityDecision. "Eligible" never outranks the evidence tier: only
 *  validated / vault_confirmed can be eligible, whatever a record claims. Nothing renders before it was knowable. */
import { PAIRS, type Pair } from "@/types/market";
import type { EligibilityDecision, EvidenceTier, PortfolioExposure } from "@/intel/contracts";
import type { LifecycleEvent, LifecycleStage, PortfolioCommandSnapshot, Position, SafetyVeto } from "@/intel/portfolioContracts";
import { viewTrades, type TradeView } from "@/desk/journal/ledger";

export const LIVE_TIERS: ReadonlySet<EvidenceTier> = new Set<EvidenceTier>(["validated", "vault_confirmed"]);
export const STAGE_META: Record<LifecycleStage, { glyph: string; label: string }> = {
  proposed: { glyph: "◇", label: "Proposed" }, research: { glyph: "◌", label: "Research" }, validated: { glyph: "✓", label: "Validated" },
  shadow: { glyph: "●", label: "Shadow" }, paused: { glyph: "⏸", label: "Paused" }, retired: { glyph: "✕", label: "Retired" },
};
const ACTIVE_STAGES: ReadonlySet<LifecycleStage> = new Set<LifecycleStage>(["validated", "shadow"]);
export type Band = "ok" | "near" | "breach";
export const BAND_LABEL: Record<Band, string> = { ok: "Within limit ●", near: "Near limit ⚠", breach: "Over limit ✕" };
export const bandOf = (used: number, limit: number): Band => { const r = used / limit; return r >= 1 ? "breach" : r >= 0.8 ? "near" : "ok"; };

export type CellState = "none" | "eligible" | "ineligible" | "tier" | "vetoed";
export const CELL_META: Record<CellState, { glyph: string; label: string }> = {
  none: { glyph: "—", label: "not evaluated" }, eligible: { glyph: "✓", label: "eligible (shadow)" }, ineligible: { glyph: "✕", label: "not eligible" },
  tier: { glyph: "✕", label: "not eligible (tier)" }, vetoed: { glyph: "⛔", label: "vetoed" },
};
export interface Cell { instrument: Pair; state: CellState; decision?: EligibilityDecision; reason: string }
export interface MatrixRow { strategy: string; tier: EvidenceTier | null; cells: Cell[] }
export interface Alert { id: string; kind: "kill_switch" | "veto" | "drawdown" | "exposure"; text: string }
export interface CurrencyRow { ccy: string; value: number; band: Band; side: string }
export interface PositionRow { id: string; position?: Position; known: boolean; closed: boolean; ccy: string }
export interface StrategyRow {
  id: string; version: string; stage: LifecycleStage; since: number; note: string; history: LifecycleEvent[];
  tier: EvidenceTier | null; weight: number | null; riskBudgetPct: number | null; inactive: boolean; flag?: string;
}
export interface PortfolioView {
  exposure: PortfolioExposure | null; alerts: Alert[]; killSwitch: boolean; limits: PortfolioCommandSnapshot["limits"];
  currencies: CurrencyRow[]; drawdown: { value: number; band: Band } | null; grossRiskPct: number;
  marginal: { strategy: string; value: number; share: number }[];
  positions: PositionRow[]; strategies: StrategyRow[]; allocTotal: number; matrix: { instruments: readonly Pair[]; rows: MatrixRow[] };
}
export type Selection = { kind: "position"; id: string } | { kind: "cell"; strategy: string; instrument: Pair } | { kind: "strategy"; id: string };

const latest = <T,>(xs: T[], at: (x: T) => number): T | undefined => xs.reduce<T | undefined>((b, x) => (b === undefined || at(x) >= at(b) ? x : b), undefined);
export const activeVetoes = (log: readonly SafetyVeto[], asOf: number): SafetyVeto[] => log.filter((v) => v.at <= asOf && (v.clearedAt === undefined || v.clearedAt > asOf));
const legs = (i: string) => i.replace("_", "/");
const sign = (v: number) => (v < 0 ? "−" : v > 0 ? "+" : "");

export function viewPortfolio(s: PortfolioCommandSnapshot, asOf: number): PortfolioView {
  const exposure = latest(s.exposures.filter((e) => e.asOf <= asOf), (e) => e.asOf) ?? null;
  const vetoes = activeVetoes(s.vetoLog, asOf);
  const vetoNames = new Set(vetoes.map((v) => v.limit));
  const unlogged = (exposure?.vetoes ?? []).filter((n) => !vetoNames.has(n));
  const { limits } = s;

  const currencies: CurrencyRow[] = Object.entries(exposure?.currencyExposure ?? {}).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]) || a[0].localeCompare(b[0]))
    .map(([ccy, value]) => ({ ccy, value, band: bandOf(Math.abs(value), limits.exposureCap), side: value < 0 ? "short" : value > 0 ? "long" : "flat" }));
  const drawdown = exposure ? { value: exposure.portfolioDrawdown, band: bandOf(exposure.portfolioDrawdown, limits.maxDrawdownPct) } : null;

  const alerts: Alert[] = [];
  if (limits.killSwitch) alerts.push({ id: "kill", kind: "kill_switch", text: "Kill switch is ON — every eligibility is overridden." });
  for (const v of vetoes) alerts.push({ id: `veto:${v.at}:${v.limit}`, kind: "veto", text: `Veto (${v.scope}${v.strategy_id ? ` · ${v.strategy_id}` : ""}): ${v.limit} observed ${v.observed} — ${v.reason}` });
  for (const n of unlogged) alerts.push({ id: `veto:unlogged:${n}`, kind: "veto", text: `Veto listed by the snapshot with no log entry: ${n}` });
  if (drawdown?.band === "breach") alerts.push({ id: "dd", kind: "drawdown", text: `Portfolio drawdown ${drawdown.value}% is over the ${limits.maxDrawdownPct}% limit.` });
  for (const c of currencies.filter((x) => x.band === "breach")) alerts.push({ id: `exp:${c.ccy}`, kind: "exposure", text: `${c.ccy} exposure ${sign(c.value)}${Math.abs(c.value)} is over the ${limits.exposureCap} cap.` });

  const posById = new Map(s.positions.map((p) => [p.position_id, p]));
  const positions: PositionRow[] = (exposure?.openPositions ?? []).map((id) => {
    const p = posById.get(id);
    const known = !!p && p.opened_at <= asOf;
    return { id, position: known ? p : undefined, known, closed: !!p && p.closed_at !== undefined && p.closed_at <= asOf, ccy: known ? legs(p!.instrument) : "" };
  });
  const grossRiskPct = positions.reduce((a, r) => a + (r.position && !r.closed ? r.position.riskPct : 0), 0);

  const mTotal = Object.values(exposure?.marginalRiskContribution ?? {}).reduce((a, v) => a + Math.abs(v), 0);
  const marginal = Object.entries(exposure?.marginalRiskContribution ?? {}).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]) || a[0].localeCompare(b[0]))
    .map(([strategy, value]) => ({ strategy, value, share: mTotal === 0 ? 0 : Math.abs(value) / mTotal }));

  const elig = s.eligibility.filter((d) => d.asOf <= asOf);
  const tierOf = (id: string): EvidenceTier | null => latest(elig.filter((d) => d.strategy_id === id), (d) => d.asOf)?.evidence_tier ?? null;
  const life = s.lifecycle.filter((e) => e.since <= asOf);
  const ids = [...new Set(life.map((e) => e.strategy_id))].sort();
  const strategies: StrategyRow[] = ids.map((id) => {
    const history = life.filter((e) => e.strategy_id === id).sort((a, b) => a.since - b.since);
    const cur = history[history.length - 1]!;
    const a = latest(s.allocations.filter((x) => x.strategy_id === id && x.effectiveFrom <= asOf), (x) => x.effectiveFrom);
    const tier = tierOf(id);
    const needsTier = cur.stage === "shadow" || cur.stage === "validated";
    return {
      id, version: cur.strategy_version, stage: cur.stage, since: cur.since, note: cur.note, history, tier,
      weight: a?.weight ?? null, riskBudgetPct: a?.riskBudgetPct ?? null, inactive: !ACTIVE_STAGES.has(cur.stage),
      flag: needsTier && (tier === null || !LIVE_TIERS.has(tier)) ? `Stage ${cur.stage} is not backed by a validated tier (${tier ?? "unknown"}).` : undefined,
    };
  });
  const allocTotal = strategies.reduce((acc, r) => acc + (r.weight !== null && !r.inactive ? r.weight : 0), 0);

  const global = limits.killSwitch || vetoes.some((v) => v.scope === "global" || v.scope === "portfolio");
  const rows: MatrixRow[] = ids.map((strategy) => ({
    strategy, tier: tierOf(strategy),
    cells: PAIRS.map((instrument): Cell => {
      const d = latest(elig.filter((x) => x.strategy_id === strategy && x.instrument === instrument), (x) => x.asOf);
      if (!d) return { instrument, state: "none", reason: "No decision known at this time." };
      if (!d.eligible) return { instrument, state: "ineligible", decision: d, reason: d.reasons.join("; ") || "Not eligible." };
      if (global || vetoes.some((v) => v.strategy_id === strategy && (v.scope === "strategy" || v.scope === "trade")))
        return { instrument, state: "vetoed", decision: d, reason: "A safety veto overrides this eligibility." };
      if (!LIVE_TIERS.has(d.evidence_tier)) return { instrument, state: "tier", decision: d, reason: `Tier ${d.evidence_tier} is not live-eligible; the record is ignored.` };
      return { instrument, state: "eligible", decision: d, reason: "Eligible for shadow only (D6)." };
    }),
  }));

  return { exposure, alerts, killSwitch: limits.killSwitch, limits, currencies, drawdown, grossRiskPct, marginal, positions, strategies, allocTotal, matrix: { instruments: PAIRS, rows } };
}

/** The underlying decisions (causal TradeViews with their decision trace) for a selection. */
export function drillDecisions(s: PortfolioCommandSnapshot, asOf: number, sel: Selection): TradeView[] {
  const all = viewTrades(s.trades, asOf);
  if (sel.kind === "position") { const p = s.positions.find((x) => x.position_id === sel.id); return p && p.opened_at <= asOf ? all.filter((t) => t.trade_id === p.trade_id) : []; }
  if (sel.kind === "cell") return all.filter((t) => t.strategy_id === sel.strategy && t.instrument === sel.instrument);
  return all.filter((t) => t.strategy_id === sel.id);
}
export const journalHref = (tradeId: string): string => `/?window=journal&trade=${encodeURIComponent(tradeId)}`;
export const signed = (v: number): string => `${sign(v)}${Math.abs(v)}`;