/** F13 — frozen "sample" cross-engine fixtures (additive; IntelligenceInsight / TradeRecord /
 *  EligibilityDecision contracts). Adds a macro P0 risk warning, a Master Brain proposal (non-geometric →
 *  context only), and one validated-strategy trade so "discretionary ≠ validated" is exercised. */
import type { EligibilityDecision, IntelligenceInsight, TradeRecord } from "@/intel/contracts";
import { SAMPLE_ELIGIBILITY, SAMPLE_INSIGHTS, SAMPLE_NOW, SAMPLE_TRADES } from "@/intel/fixtures";

export const INTEGRATION_INSIGHTS: IntelligenceInsight[] = [
  ...SAMPLE_INSIGHTS,
  {
    id: "ins:macro:1", sourceEngine: "macro", sourceVersion: "sample-0", instrument: "EUR_USD",
    observedAt: SAMPLE_NOW - 600, availableAt: SAMPLE_NOW - 600, expiresAt: SAMPLE_NOW + 3_600,
    kind: "risk_warning", status: "active", evidenceIds: [], objectIds: [], visualizationIds: [], provenanceId: "prov:macro:1",
  },
  {
    id: "ins:brain:1", sourceEngine: "brain", sourceVersion: "sample-0", instrument: "EUR_USD",
    observedAt: SAMPLE_NOW - 300, availableAt: SAMPLE_NOW - 300,
    kind: "interpretation", status: "proposed", evidenceIds: [], objectIds: [], visualizationIds: [], provenanceId: "prov:brain:1",
  },
];

const VALIDATED_TRADE: TradeRecord = {
  trade_id: "t:v1", strategy_id: "sample-validated", strategy_version: "sample-0", category: "executed",
  instrument: "EUR_USD", direction: "long", entry_time: SAMPLE_NOW - 1_800, entry_price: 1.1026,
  entry_reason_codes: ["sr_reaction"], decision_trace: [{ at: SAMPLE_NOW - 1_800, step: "allowed", rule: "sr_reaction", evidenceIds: [] }],
  data_version: "sample-0", cost_model_version: "scalp_bidask-0",
};

export const INTEGRATION_TRADES: TradeRecord[] = [...SAMPLE_TRADES, VALIDATED_TRADE];

export const INTEGRATION_ELIGIBILITY: EligibilityDecision[] = [
  SAMPLE_ELIGIBILITY,
  { strategy_id: "sample-validated", strategy_version: "sample-0", evidence_tier: "validated", instrument: "EUR_USD", asOf: SAMPLE_NOW, eligible: true, reasons: [], gatesFired: [] },
];