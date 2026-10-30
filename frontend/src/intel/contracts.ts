/** F0 — Intelligence contracts (zod + inferred types). The frontend half of the
 *  canonical records in docs/CONTRACTS.md: engines publish these; nothing here draws.
 *  Times are UTC seconds. Reuses PairSchema from the DESK object model. Pure; no React. */
import { z } from "zod";
import { PairSchema } from "@/desk/types/schemas";

/* ---- shared enums ---- */
export const EvidenceTierSchema = z.enum(["exploratory", "in_sample", "validated", "vault_confirmed"]);
export type EvidenceTier = z.infer<typeof EvidenceTierSchema>;

export const InsightKindSchema = z.enum(["observation", "interpretation", "scenario", "forecast", "risk_warning"]);
export const InsightStatusSchema = z.enum(["proposed", "active", "confirmed", "invalidated", "expired"]);

/* ---- Visual Intelligence ---- */
export const IntelligenceInsightSchema = z.object({
  id: z.string().min(1),
  sourceEngine: z.string().min(1),
  sourceVersion: z.string().min(1),
  instrument: PairSchema,
  observedAt: z.number().int(),
  availableAt: z.number().int(),
  expiresAt: z.number().int().optional(),
  kind: InsightKindSchema,
  status: InsightStatusSchema,
  evidenceIds: z.array(z.string()).default([]),
  objectIds: z.array(z.string()).default([]),
  visualizationIds: z.array(z.string()).default([]),
  provenanceId: z.string().min(1),
});
export type IntelligenceInsight = z.infer<typeof IntelligenceInsightSchema>;

export const ChartMappingSchema = z.object({
  mappingId: z.string().min(1),
  sourceModule: z.string().min(1),
  objectIds: z.array(z.string()).default([]),
  overlayType: z.string().min(1),
  geometryRefs: z.array(z.string()).default([]),
  focusTimeRange: z.tuple([z.number().int(), z.number().int()]).optional(),
  visibility: z.enum(["hidden", "visible", "focused"]),
  evidenceIds: z.array(z.string()).default([]),
  scenarioId: z.string().optional(),
});
export type ChartMapping = z.infer<typeof ChartMappingSchema>;

export const ViewManifestSchema = z.object({
  scope: z.string().min(1),
  sourceObjectIds: z.array(z.string()).default([]),
  layers: z.array(z.string()).default([]),
  priority: z.number(),
  timeWindow: z.tuple([z.number().int(), z.number().int()]),
  evidenceLinks: z.array(z.string()).default([]),
});
export type ViewManifest = z.infer<typeof ViewManifestSchema>;

/* ---- Market Intelligence: RegimeSnapshot ---- */
export const RegimeSnapshotSchema = z.object({
  id: z.string().min(1),
  instrument: PairSchema,
  t_event: z.number().int(),
  available_at: z.number().int(),
  direction: z.object({ bullish_p: z.number(), bearish_p: z.number(), neutral_p: z.number() }),
  trend_strength: z.number(),
  volatility_state: z.enum(["dead", "normal", "expanding", "extreme"]),
  structure_state: z.enum(["trend", "range", "compression", "transition"]),
  momentum_state: z.enum(["strengthening", "stable", "fading"]),
  transition_risk: z.number(),
  timeframe_alignment: z.enum(["aligned", "mixed", "conflict"]),
  data_quality: z.enum(["valid", "degraded", "absent"]),
  model_version: z.string().min(1),
  rules_version: z.string().min(1),
});
export type RegimeSnapshot = z.infer<typeof RegimeSnapshotSchema>;

/* ---- Scenario Intelligence ---- */
export const ScenarioBranchSchema = z.object({
  label: z.string().min(1),
  geometryRefs: z.array(z.string()).default([]),
  conditions: z.array(z.string()).default([]),
  invalidation: z.string(),
  horizon: z.number().int(),
  expiry: z.number().int(),
});
export const ScenarioSpecificationSchema = z.object({
  id: z.string().min(1),
  version: z.string().min(1),
  instrument: PairSchema,
  asOf: z.number().int(),
  kind: z.enum(["conditional", "forecast"]),
  branches: z.array(ScenarioBranchSchema).min(1),
  sourceEngine: z.string().min(1),
  sourceVersion: z.string().min(1),
  evidenceIds: z.array(z.string()).default([]),
  objectRefs: z.array(z.string()).default([]),
  modelRef: z.string().optional(),
});
export type ScenarioSpecification = z.infer<typeof ScenarioSpecificationSchema>;

export const ScenarioStateSchema = z.object({
  scenarioId: z.string().min(1),
  version: z.string().min(1),
  asOf: z.number().int(),
  status: z.enum(["proposed", "active", "triggered", "invalidated", "expired"]),
  firedConditions: z.array(z.string()).default([]),
  brokenInvalidations: z.array(z.string()).default([]),
  observedAt: z.number().int(),
  availableAt: z.number().int(),
});
export type ScenarioState = z.infer<typeof ScenarioStateSchema>;

export const ForecastDistributionSchema = z.object({
  instrument: PairSchema,
  asOf: z.number().int(),
  horizon: z.number().int(),
  modelRef: z.string().min(1),
  modelVersion: z.string().min(1),
  distribution: z.record(z.number()).optional(),
  interval: z.object({ lo: z.number(), hi: z.number() }).optional(),
  calibration: z.object({ oosReliability: z.number(), sharpness: z.number(), sampleSize: z.number().int() }),
});
export type ForecastDistribution = z.infer<typeof ForecastDistributionSchema>;

/* ---- Strategy / Trade / Portfolio ---- */
export const DecisionStepSchema = z.object({
  at: z.number().int(),
  step: z.enum(["allowed", "rejected", "modified", "exited"]),
  rule: z.string(),
  evidenceIds: z.array(z.string()).default([]),
});
export const TradeRecordSchema = z.object({
  trade_id: z.string().min(1),
  strategy_id: z.string().min(1),
  strategy_version: z.string().min(1),
  category: z.enum(["executed", "rejected", "eligible", "counterfactual"]),
  instrument: PairSchema,
  direction: z.enum(["long", "short"]),
  entry_time: z.number().int(),
  exit_time: z.number().int().optional(),
  entry_price: z.number(),
  exit_price: z.number().optional(),
  stop: z.number().optional(),
  target: z.number().optional(),
  entry_reason_codes: z.array(z.string()).default([]),
  regime_snapshot_id: z.string().optional(),
  gross_pnl: z.number().optional(),
  net_pnl: z.number().optional(),
  R: z.number().optional(),
  mfe_R: z.number().optional(),
  mae_R: z.number().optional(),
  spread_cost: z.number().optional(),
  slippage: z.number().optional(),
  commission: z.number().optional(),
  exit_reason: z.string().optional(),
  hold_min: z.number().optional(),
  session: z.string().optional(),
  decision_trace: z.array(DecisionStepSchema).default([]),
  data_version: z.string().min(1),
  code_commit: z.string().optional(),
  cost_model_version: z.string().min(1),
});
export type TradeRecord = z.infer<typeof TradeRecordSchema>;

export const EligibilityDecisionSchema = z.object({
  strategy_id: z.string().min(1),
  strategy_version: z.string().min(1),
  evidence_tier: EvidenceTierSchema,
  instrument: PairSchema,
  asOf: z.number().int(),
  eligible: z.boolean(),
  reasons: z.array(z.string()).default([]),
  regime_snapshot_id: z.string().optional(),
  gatesFired: z.array(z.string()).default([]),
});
export type EligibilityDecision = z.infer<typeof EligibilityDecisionSchema>;

export const PortfolioExposureSchema = z.object({
  asOf: z.number().int(),
  strategies: z.array(z.string()).default([]),
  openPositions: z.array(z.string()).default([]),
  currencyExposure: z.record(z.number()).default({}),
  portfolioDrawdown: z.number(),
  tailRisk: z.number(),
  correlationState: z.string(),
  marginalRiskContribution: z.record(z.number()).default({}),
  constraints: z.array(z.string()).default([]),
  vetoes: z.array(z.string()).default([]),
});
export type PortfolioExposure = z.infer<typeof PortfolioExposureSchema>;

/* ---- Research OS: Verdict ---- */
export const VerdictSchema = z.object({
  status: z.enum(["PASS", "FAIL", "INCONCLUSIVE"]),
  passed: z.boolean(),
  n_trades: z.number().int(),
  expectancy_pips: z.number(),
  win_rate: z.number(),
  fold_pos_frac: z.number(),
  p_value: z.number(),
  fdr_alpha: z.number().optional(),
  split: z.enum(["train", "valid", "vault"]).optional(),
  evidence_tier: EvidenceTierSchema.optional(),
  data_version: z.string().optional(),
  cost_model_version: z.string().optional(),
});
export type Verdict = z.infer<typeof VerdictSchema>;

/* ---- async Job ---- */
export const JobSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["scan", "run", "batch", "regime", "validate"]),
  status: z.enum(["queued", "running", "done", "error"]),
  created_at: z.number().int(),
  started_at: z.number().int().optional(),
  finished_at: z.number().int().optional(),
  progress: z.number().optional(),
  result_ref: z.string().optional(),
  error: z.object({ detail: z.string() }).optional(),
  experiment_id: z.string().optional(),
});
export type Job = z.infer<typeof JobSchema>;

/* ---- parse helpers (throw on bad input, like the Scan parsers) ---- */
export const parseInsights = (u: unknown): IntelligenceInsight[] => z.array(IntelligenceInsightSchema).parse(u);
export const parseRegime = (u: unknown): RegimeSnapshot => RegimeSnapshotSchema.parse(u);
export const parseScenarios = (u: unknown): ScenarioSpecification[] => z.array(ScenarioSpecificationSchema).parse(u);
export const parseTrades = (u: unknown): TradeRecord[] => z.array(TradeRecordSchema).parse(u);
export const parsePortfolio = (u: unknown): PortfolioExposure => PortfolioExposureSchema.parse(u);
export const parseVerdicts = (u: unknown): Verdict[] => z.array(VerdictSchema).parse(u);
export const parseJob = (u: unknown): Job => JobSchema.parse(u);

/* ---- Research OS: validation ledger (F14, additive) ---- */
export const ExperimentRecordSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  strategy_id: z.string().min(1),
  strategy_version: z.string().min(1),
  ts: z.number().int(),
  verdict: VerdictSchema,
});
export type ExperimentRecord = z.infer<typeof ExperimentRecordSchema>;

export const VaultLogEntrySchema = z.object({
  ts: z.number().int(),
  experimentId: z.string().min(1),
  finalConfirmation: z.boolean(),
});
export type VaultLogEntry = z.infer<typeof VaultLogEntrySchema>;

/** ValidationReport (CONTRACTS §6) + the experiment list and VAULT consultation log, read-only. */
export const LedgerSnapshotSchema = z.object({
  experiments: z.array(ExperimentRecordSchema),
  experiment_count: z.number().int().nonnegative(),
  fdr_alpha: z.number(),
  createdAt: z.number().int(),
  vault: z.object({ consultations: z.number().int().nonnegative(), log: z.array(VaultLogEntrySchema).default([]) }),
});
export type LedgerSnapshot = z.infer<typeof LedgerSnapshotSchema>;
export const parseLedger = (u: unknown): LedgerSnapshot => LedgerSnapshotSchema.parse(u);