/** F17 — frozen "sample" Portfolio Command snapshot. Deliberately includes records the console must not trust:
 *  an `eligible` decision for an exploratory strategy, and an eligible decision under an active strategy veto. */
import type { TradeRecord } from "./contracts";
import type { PortfolioCommandSnapshot } from "./portfolioContracts";
import { SAMPLE_NOW as N } from "./fixtures";

const trade = (o: Partial<TradeRecord> & Pick<TradeRecord, "trade_id" | "strategy_id" | "category" | "instrument" | "entry_time">): TradeRecord => ({
  strategy_version: "sample-0", direction: "long", entry_price: 1.1, entry_reason_codes: [], decision_trace: [],
  data_version: "sample-0", cost_model_version: "scalp_bidask-0", ...o,
});
const elig = (strategy_id: string, evidence_tier: "exploratory" | "in_sample" | "validated" | "vault_confirmed", instrument: "EUR_USD" | "GBP_USD" | "USD_JPY",
  asOf: number, eligible: boolean, reasons: string[] = [], gatesFired: string[] = []) =>
  ({ strategy_id, strategy_version: "sample-0", evidence_tier, instrument, asOf, eligible, reasons, gatesFired });

export const SAMPLE_PORTFOLIO_COMMAND: PortfolioCommandSnapshot = {
  limits: { killSwitch: false, exposureCap: 2, maxDrawdownPct: 5 },
  exposures: [
    { asOf: N - 20_000, strategies: ["orb_v2", "fade_lowvol"], openPositions: ["pos:3"], currencyExposure: { USD: 0.5, JPY: -0.5 },
      portfolioDrawdown: 1.1, tailRisk: 0.3, correlationState: "low", marginalRiskContribution: { orb_v2: 0.2, fade_lowvol: 0.3 }, constraints: [], vetoes: [] },
    { asOf: N - 1_000, strategies: ["orb_v2", "ob_reclaim", "sample", "fade_lowvol"], openPositions: ["pos:1", "pos:2"],
      currencyExposure: { EUR: 1, GBP: 0.7, USD: -1.7 }, portfolioDrawdown: 3.2, tailRisk: 0.8,
      correlationState: "elevated: EUR_USD and GBP_USD overlap on USD", marginalRiskContribution: { orb_v2: 0.6, ob_reclaim: 0.4 },
      constraints: ["max 2 correlated positions"], vetoes: ["strategy_drawdown"] },
  ],
  eligibility: [
    elig("orb_v2", "validated", "EUR_USD", N - 20_000, true),
    elig("orb_v2", "validated", "EUR_USD", N - 2_000, false, ["correlation cap reached"], ["correlation_cap"]),
    elig("orb_v2", "validated", "GBP_USD", N - 2_000, true),
    elig("ob_reclaim", "vault_confirmed", "EUR_USD", N - 2_000, true),
    elig("ob_reclaim", "vault_confirmed", "GBP_USD", N - 2_000, true),
    elig("sample", "exploratory", "EUR_USD", N - 2_000, true, ["(inconsistent sample record)"]),
    elig("fade_lowvol", "in_sample", "USD_JPY", N - 2_000, false, ["not validated"], ["below_min_confidence"]),
  ],
  allocations: [
    { strategy_id: "orb_v2", weight: 0.4, riskBudgetPct: 1, effectiveFrom: N - 150_000 },
    { strategy_id: "ob_reclaim", weight: 0.35, riskBudgetPct: 0.8, effectiveFrom: N - 120_000 },
    { strategy_id: "fade_lowvol", weight: 0.25, riskBudgetPct: 0.5, effectiveFrom: N - 100_000 },
    { strategy_id: "sample", weight: 0, riskBudgetPct: 0, effectiveFrom: N - 100_000 },
  ],
  positions: [
    { position_id: "pos:1", strategy_id: "orb_v2", instrument: "EUR_USD", direction: "long", riskPct: 1, opened_at: N - 9_000, trade_id: "tp:1" },
    { position_id: "pos:2", strategy_id: "ob_reclaim", instrument: "GBP_USD", direction: "long", riskPct: 0.7, opened_at: N - 4_000, trade_id: "tp:2" },
    { position_id: "pos:3", strategy_id: "fade_lowvol", instrument: "USD_JPY", direction: "long", riskPct: 0.5, opened_at: N - 25_000, closed_at: N - 7_000, trade_id: "tp:3" },
  ],
  lifecycle: [
    { strategy_id: "orb_v2", strategy_version: "sample-0", stage: "research", since: N - 300_000, note: "" },
    { strategy_id: "orb_v2", strategy_version: "sample-0", stage: "validated", since: N - 200_000, note: "Judge PASS" },
    { strategy_id: "orb_v2", strategy_version: "sample-0", stage: "shadow", since: N - 150_000, note: "Shadow only (D6)" },
    { strategy_id: "ob_reclaim", strategy_version: "sample-0", stage: "research", since: N - 280_000, note: "" },
    { strategy_id: "ob_reclaim", strategy_version: "sample-0", stage: "validated", since: N - 180_000, note: "Judge PASS + VAULT read logged" },
    { strategy_id: "ob_reclaim", strategy_version: "sample-0", stage: "shadow", since: N - 120_000, note: "Shadow only (D6)" },
    { strategy_id: "sample", strategy_version: "sample-0", stage: "proposed", since: N - 400_000, note: "" },
    { strategy_id: "sample", strategy_version: "sample-0", stage: "research", since: N - 390_000, note: "" },
    { strategy_id: "fade_lowvol", strategy_version: "sample-0", stage: "research", since: N - 300_000, note: "" },
    { strategy_id: "fade_lowvol", strategy_version: "sample-0", stage: "shadow", since: N - 100_000, note: "(inconsistent sample record: tier is in_sample)" },
    { strategy_id: "fade_lowvol", strategy_version: "sample-0", stage: "paused", since: N - 30_000, note: "Drawdown review" },
  ],
  vetoLog: [
    { at: N - 30_000, scope: "portfolio", limit: "daily_loss_limit", observed: 2.1, reason: "Daily loss limit touched.", actor: "safety", clearedAt: N - 25_000 },
    { at: N - 3_000, scope: "strategy", limit: "strategy_drawdown", observed: 2.4, reason: "ob_reclaim drawdown past its limit.", actor: "safety", strategy_id: "ob_reclaim" },
  ],
  trades: [
    trade({ trade_id: "tp:1", strategy_id: "orb_v2", category: "executed", instrument: "EUR_USD", entry_time: N - 9_000, entry_reason_codes: ["orb_breakout"],
      decision_trace: [{ at: N - 9_000, step: "allowed", rule: "eligible_validated", evidenceIds: [] }] }),
    trade({ trade_id: "tp:2", strategy_id: "ob_reclaim", category: "executed", instrument: "GBP_USD", entry_time: N - 4_000, entry_reason_codes: ["ob_reclaim"],
      decision_trace: [{ at: N - 4_000, step: "allowed", rule: "eligible_vault_confirmed", evidenceIds: [] }] }),
    trade({ trade_id: "tp:3", strategy_id: "fade_lowvol", category: "executed", instrument: "USD_JPY", entry_time: N - 25_000, exit_time: N - 7_000, exit_price: 1.0995, R: -0.6, exit_reason: "stop",
      decision_trace: [{ at: N - 25_000, step: "allowed", rule: "eligible", evidenceIds: [] }, { at: N - 7_000, step: "exited", rule: "stop", evidenceIds: [] }] }),
    trade({ trade_id: "tp:4", strategy_id: "orb_v2", category: "rejected", instrument: "EUR_USD", entry_time: N - 2_500, entry_reason_codes: ["orb_breakout"],
      decision_trace: [{ at: N - 2_500, step: "rejected", rule: "correlation_cap", evidenceIds: [] }] }),
  ],
};