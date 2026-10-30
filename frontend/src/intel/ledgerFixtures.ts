/** F14 — frozen "sample" validation ledger (additive). experiment_count (47) > experiments listed (4):
 *  the Judge corrects for every variant tested, not just the ones shown. e:4 claims `vault_confirmed`
 *  with NO logged final-confirmation read, so the board must downgrade it (sample of an inconsistent record). */
import type { LedgerSnapshot } from "./contracts";
import { SAMPLE_NOW, SAMPLE_VERDICTS } from "./fixtures";

const base = { data_version: "sample-0", cost_model_version: "scalp_bidask-0", fdr_alpha: 0.05 } as const;

export const SAMPLE_LEDGER: LedgerSnapshot = {
  experiments: [
    { id: "exp:1", name: "Order-block reclaim H1", strategy_id: "obe", strategy_version: "sample-0", ts: SAMPLE_NOW - 40_000,
      verdict: { ...base, status: "FAIL", passed: false, n_trades: 85, expectancy_pips: -0.4, win_rate: 0.41, fold_pos_frac: 0.3, p_value: 0.62, split: "valid", evidence_tier: "in_sample" } },
    { id: "exp:2", name: "Sample strategy (train)", strategy_id: "sample", strategy_version: "sample-0", ts: SAMPLE_NOW - 30_000,
      verdict: { ...SAMPLE_VERDICTS[0]!, fdr_alpha: 0.05 } },
    { id: "exp:3", name: "Sample validated strategy", strategy_id: "sample-validated", strategy_version: "sample-0", ts: SAMPLE_NOW - 20_000,
      verdict: { ...base, status: "PASS", passed: true, n_trades: 62, expectancy_pips: 1.1, win_rate: 0.52, fold_pos_frac: 0.8, p_value: 0.004, split: "valid", evidence_tier: "validated" } },
    { id: "exp:4", name: "Unlogged vault claim (sample)", strategy_id: "sample-claim", strategy_version: "sample-0", ts: SAMPLE_NOW - 10_000,
      verdict: { ...base, status: "PASS", passed: true, n_trades: 40, expectancy_pips: 0.8, win_rate: 0.5, fold_pos_frac: 0.7, p_value: 0.02, split: "vault", evidence_tier: "vault_confirmed" } },
  ],
  experiment_count: 47, fdr_alpha: 0.05, createdAt: SAMPLE_NOW - 5_000,
  vault: { consultations: 0, log: [] },
};