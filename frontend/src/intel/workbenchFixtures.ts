/** F15 — frozen "sample" workbench. Includes a Brain proposal (not yet tested), a done job, a running job,
 *  a queued job blocked on it (DAG), and an errored job. Report exp:2 is a low-sample INCONCLUSIVE. */
import type { WorkbenchSnapshot, StrategySpecification } from "./workbenchContracts";
import { SAMPLE_NOW, SAMPLE_VERDICTS } from "./fixtures";

const spec = (id: string, v: string, cond: string[]): StrategySpecification => ({
  id, version: v,
  universe: { instruments: ["EUR_USD"], timeframe: "H1" },
  entry: { direction: "both", conditions: cond },
  exit: { stop: "atr_1.5", target: "r_2" },
  risk: { risk_per_trade: 0.005 },
  execution: { model: "bidask" },
});

export const SAMPLE_WORKBENCH: WorkbenchSnapshot = {
  hypotheses: [
    { id: "hyp:1", hypothesis: "Order-block reclaim after London sweep continues in NY.", strategySpec: spec("obe", "sample-0", ["sweep", "reclaim"]),
      testPlan: "Train + valid split; judge over all variants; no VAULT read.", proposedBy: "master_brain", asOf: SAMPLE_NOW - 50_000 },
    { id: "hyp:2", hypothesis: "Session-range fade works only in low-volatility regimes.", strategySpec: spec("fade", "sample-0", ["range", "low_vol"]),
      testPlan: "Regime-conditioned scan; compare to random-reference null.", proposedBy: "human", asOf: SAMPLE_NOW - 20_000 },
  ],
  strategies: [
    { strategyId: "obe", version: "sample-0", spec: spec("obe", "sample-0", ["sweep", "reclaim"]), highestTier: "in_sample", createdAt: SAMPLE_NOW - 45_000 },
    { strategyId: "obe", version: "sample-1", spec: spec("obe", "sample-1", ["sweep", "reclaim", "htf_bias"]), highestTier: "exploratory", createdAt: SAMPLE_NOW - 15_000 },
  ],
  jobs: [
    { label: "Scan OB reclaim", hypothesisId: "hyp:1", strategyVersion: "sample-0", dependsOn: [],
      job: { id: "job:a", kind: "scan", status: "done", created_at: SAMPLE_NOW - 44_000, started_at: SAMPLE_NOW - 43_900, finished_at: SAMPLE_NOW - 43_000, result_ref: "exp:1", experiment_id: "exp:1" } },
    { label: "Validate OB reclaim", hypothesisId: "hyp:1", strategyVersion: "sample-0", dependsOn: ["job:a"],
      job: { id: "job:b", kind: "validate", status: "running", created_at: SAMPLE_NOW - 42_000, started_at: SAMPLE_NOW - 41_000, progress: 0.4, experiment_id: "exp:2" } },
    { label: "Batch htf_bias variant", hypothesisId: "hyp:1", strategyVersion: "sample-1", dependsOn: ["job:b"],
      job: { id: "job:c", kind: "batch", status: "queued", created_at: SAMPLE_NOW - 14_000 } },
    { label: "Regime-conditioned fade", hypothesisId: "hyp:2", dependsOn: [],
      job: { id: "job:d", kind: "regime", status: "error", created_at: SAMPLE_NOW - 19_000, started_at: SAMPLE_NOW - 18_900, finished_at: SAMPLE_NOW - 18_800, error: { detail: "dataset version missing (sample)" } } },
  ],
  reports: [
    { id: "rep:1", hypothesisId: "hyp:1", strategyVersion: "sample-0", experimentId: "exp:2", createdAt: SAMPLE_NOW - 30_000,
      experiment_count: 47, fdr_alpha: 0.05, verdicts: SAMPLE_VERDICTS },
  ],
};