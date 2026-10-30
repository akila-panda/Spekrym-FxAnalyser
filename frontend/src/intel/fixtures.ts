/** F0 — frozen, deterministic sample fixtures for the intelligence contracts and for a mock
 *  DeskSource.getEngineObjects. All "sample" data; a real backend replaces these. Times UTC seconds. */
import type { AnalysisObject } from "@/desk/types/schemas";
import type {
  IntelligenceInsight, RegimeSnapshot, ScenarioSpecification, ScenarioState,
  ForecastDistribution, TradeRecord, EligibilityDecision, PortfolioExposure, Verdict, Job, ViewManifest, ChartMapping,
} from "./contracts";

export const SAMPLE_NOW = 1_746_828_000; // 2025-05-09T22:00:00Z — matches the DESK mock window
const PAIR = "EUR_USD";

export const SAMPLE_ENGINE_OBJECTS: AnalysisObject[] = [
  {
    id: "sr_level:EUR_USD:H1:1746810000",
    type: "sr_level", layer: "levels", pair: PAIR, source_tf: "H1",
    geometry: { bands: [{ pHigh: 1.1025, pLow: 1.1019 }], anchorTimes: [1_746_810_000] },
    t_event: 1_746_810_000, known_at: 1_746_813_600, confirmed_at: null,
    lifecycle: [{ kind: "established", t: 1_746_810_000, known_at: 1_746_813_600 }],
    provenance: { rulesVersion: "sample-0", dataKind: "sample", detector: "sr", detectorVersion: 0 },
    evidence: [],
  },
];

export const SAMPLE_INSIGHTS: IntelligenceInsight[] = [
  {
    id: "ins:1", sourceEngine: "session", sourceVersion: "sample-0", instrument: PAIR,
    observedAt: 1_746_813_600, availableAt: 1_746_813_600, kind: "observation", status: "active",
    evidenceIds: [], objectIds: ["sr_level:EUR_USD:H1:1746810000"], visualizationIds: [], provenanceId: "prov:1",
  },
];

export const SAMPLE_REGIME: RegimeSnapshot = {
  id: "regime:EUR_USD:1746828000", instrument: PAIR, t_event: SAMPLE_NOW, available_at: SAMPLE_NOW,
  direction: { bullish_p: 0.34, bearish_p: 0.33, neutral_p: 0.33 },
  trend_strength: 0.4, volatility_state: "normal", structure_state: "range",
  momentum_state: "stable", transition_risk: 0.3, timeframe_alignment: "mixed",
  data_quality: "valid", model_version: "sample-0", rules_version: "sample-0",
};

export const SAMPLE_SCENARIOS: ScenarioSpecification[] = [
  {
    id: "scn:1", version: "1", instrument: PAIR, asOf: SAMPLE_NOW, kind: "conditional",
    branches: [
      { label: "bullish continuation", geometryRefs: [], conditions: ["holds support", "confirms structure"], invalidation: "close below support", horizon: 86_400, expiry: SAMPLE_NOW + 86_400 },
      { label: "range", geometryRefs: [], conditions: ["stays inside band"], invalidation: "breaks either edge", horizon: 86_400, expiry: SAMPLE_NOW + 86_400 },
    ],
    sourceEngine: "scenario", sourceVersion: "sample-0", evidenceIds: [], objectRefs: ["sr_level:EUR_USD:H1:1746810000"],
  },
];

export const SAMPLE_SCENARIO_STATE: ScenarioState = {
  scenarioId: "scn:1", version: "1", asOf: SAMPLE_NOW, status: "active",
  firedConditions: [], brokenInvalidations: [], observedAt: SAMPLE_NOW, availableAt: SAMPLE_NOW,
};

export const SAMPLE_FORECAST: ForecastDistribution = {
  instrument: PAIR, asOf: SAMPLE_NOW, horizon: 86_400, modelRef: "sample-model", modelVersion: "sample-0",
  distribution: { up: 0.34, flat: 0.33, down: 0.33 },
  calibration: { oosReliability: 0.0, sharpness: 0.0, sampleSize: 0 },
};

export const SAMPLE_TRADES: TradeRecord[] = [
  {
    trade_id: "t:1", strategy_id: "sample", strategy_version: "sample-0", category: "executed",
    instrument: PAIR, direction: "long", entry_time: 1_746_813_600, exit_time: 1_746_820_800,
    entry_price: 1.1020, exit_price: 1.1035, stop: 1.1010, target: 1.1040,
    entry_reason_codes: ["sr_reaction"], regime_snapshot_id: "regime:EUR_USD:1746828000",
    gross_pnl: 15, net_pnl: 13.4, R: 1.3, exit_reason: "tp", hold_min: 120, session: "london",
    decision_trace: [{ at: 1_746_813_600, step: "allowed", rule: "sr_reaction", evidenceIds: [] }],
    data_version: "sample-0", cost_model_version: "scalp_bidask-0",
  },
  {
    trade_id: "t:2", strategy_id: "sample", strategy_version: "sample-0", category: "rejected",
    instrument: PAIR, direction: "short", entry_time: 1_746_817_200, entry_price: 1.1030,
    entry_reason_codes: ["dead_volatility"], decision_trace: [{ at: 1_746_817_200, step: "rejected", rule: "dead_volatility", evidenceIds: [] }],
    data_version: "sample-0", cost_model_version: "scalp_bidask-0",
  },
  {
    trade_id: "t:3", strategy_id: "sample", strategy_version: "sample-0", category: "eligible",
    instrument: PAIR, direction: "long", entry_time: 1_746_822_600, entry_price: 1.1028,
    entry_reason_codes: ["sr_reaction"], decision_trace: [{ at: 1_746_822_600, step: "allowed", rule: "eligible_not_taken", evidenceIds: [] }],
    data_version: "sample-0", cost_model_version: "scalp_bidask-0",
  },
  {
    trade_id: "t:4", strategy_id: "sample", strategy_version: "sample-0", category: "counterfactual",
    instrument: PAIR, direction: "short", entry_time: 1_746_824_400, exit_time: 1_746_826_200,
    entry_price: 1.1032, exit_price: 1.1038, stop: 1.1038, R: -1, exit_reason: "stop", hold_min: 30, session: "ny",
    entry_reason_codes: ["dead_volatility"], decision_trace: [{ at: 1_746_824_400, step: "rejected", rule: "dead_volatility", evidenceIds: [] }],
    data_version: "sample-0", cost_model_version: "scalp_bidask-0",
  },
];

export const SAMPLE_ELIGIBILITY: EligibilityDecision = {
  strategy_id: "sample", strategy_version: "sample-0", evidence_tier: "exploratory",
  instrument: PAIR, asOf: SAMPLE_NOW, eligible: false, reasons: ["not validated"], gatesFired: ["below_min_confidence"],
};

export const SAMPLE_PORTFOLIO: PortfolioExposure = {
  asOf: SAMPLE_NOW, strategies: ["sample"], openPositions: [],
  currencyExposure: { USD: 0, EUR: 0 }, portfolioDrawdown: 0, tailRisk: 0, correlationState: "n/a",
  marginalRiskContribution: {}, constraints: [], vetoes: [],
};

export const SAMPLE_VERDICTS: Verdict[] = [
  { status: "INCONCLUSIVE", passed: false, n_trades: 18, expectancy_pips: 0.2, win_rate: 0.33,
    fold_pos_frac: 0.5, p_value: 0.4, fdr_alpha: 0.05, split: "train", evidence_tier: "in_sample",
    data_version: "sample-0", cost_model_version: "scalp_bidask-0" },
];

export const SAMPLE_JOB: Job = { id: "job:1", kind: "run", status: "done", created_at: SAMPLE_NOW - 60, finished_at: SAMPLE_NOW, result_ref: "exp:1" };

export const SAMPLE_VIEW_MANIFEST: ViewManifest = {
  scope: "prepare", sourceObjectIds: ["sr_level:EUR_USD:H1:1746810000"], layers: ["levels"],
  priority: 1, timeWindow: [SAMPLE_NOW - 86_400, SAMPLE_NOW], evidenceLinks: ["prov:1"],
};

export const SAMPLE_CHART_MAPPING: ChartMapping = {
  mappingId: "map:1", sourceModule: "session", objectIds: ["sr_level:EUR_USD:H1:1746810000"],
  overlayType: "level", geometryRefs: ["sr_level:EUR_USD:H1:1746810000"], visibility: "visible", evidenceIds: ["prov:1"],
};