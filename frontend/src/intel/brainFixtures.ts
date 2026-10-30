/** F16 — frozen "sample" Master Brain console. Deliberately includes inconsistent records the console must
 *  not trust: a Brain self-approval (prop:2), and a `read_vault` permission marked granted. */
import type { BrainConsoleSnapshot } from "./brainContracts";
import { SAMPLE_NOW } from "./fixtures";

const dec = (actor: string, action: string, ts: number, rationale: string) => ({
  actor, action, permission: "register_experiment", source: "authorization_service", sourceVersion: "sample-0", timestamp: ts, rationale,
});

export const SAMPLE_BRAIN: BrainConsoleSnapshot = {
  objectives: [
    { id: "obj:1", text: "Find regime-conditioned edges on EUR_USD H1", status: "active", createdAt: SAMPLE_NOW - 100_000 },
    { id: "obj:2", text: "Reduce multiple-testing load", status: "paused", createdAt: SAMPLE_NOW - 80_000 },
  ],
  proposals: [
    { id: "prop:1", kind: "hypothesis", title: "Order-block reclaim continues in NY", rationale: "London sweep followed by reclaim; see hyp:1.", objectiveId: "obj:1", hypothesisId: "hyp:1", proposedAt: SAMPLE_NOW - 50_000 },
    { id: "prop:2", kind: "experiment_batch", title: "Batch the htf_bias variant", rationale: "Adds a higher-timeframe bias filter to sample-0.", objectiveId: "obj:1", proposedAt: SAMPLE_NOW - 14_000 },
    { id: "prop:3", kind: "strategy_spec", title: "Range fade in low-volatility regime", rationale: "Regime-conditioned fade; compare against the random reference.", objectiveId: "obj:1", hypothesisId: "hyp:2", proposedAt: SAMPLE_NOW - 5_000 },
    { id: "prop:4", kind: "hypothesis", title: "Asian range breakout drift", rationale: "Stale idea kept for the record.", proposedAt: SAMPLE_NOW - 90_000, expiresAt: SAMPLE_NOW - 60_000 },
    { id: "prop:5", kind: "hypothesis", title: "Weekly open gap fill", rationale: "Low prior; sample for the rejected state.", proposedAt: SAMPLE_NOW - 4_000 },
  ],
  permissions: [
    { capability: "propose_hypothesis", granted: true, reason: "Core Brain role.", effectiveFrom: SAMPLE_NOW - 100_000 },
    { capability: "draft_spec", granted: true, reason: "Typed specs only.", effectiveFrom: SAMPLE_NOW - 100_000 },
    { capability: "register_experiment", granted: true, reason: "Only after a human authorization.", effectiveFrom: SAMPLE_NOW - 100_000 },
    { capability: "read_vault", granted: true, reason: "(inconsistent sample record)", effectiveFrom: SAMPLE_NOW - 100_000 },
    { capability: "write_verdict", granted: false, reason: "Judge is the sole verdict authority.", effectiveFrom: SAMPLE_NOW - 100_000 },
  ],
  budgets: [
    { id: "bud:tokens", resource: "llm_tokens", limit: 200_000, used: 150_000, window: "day", observedAt: SAMPLE_NOW - 1_000 },
    { id: "bud:jobs", resource: "compute_jobs", limit: 20, used: 17, window: "day", observedAt: SAMPLE_NOW - 1_000 },
    { id: "bud:exp", resource: "experiments", limit: 50, used: 50, window: "week", observedAt: SAMPLE_NOW - 1_000 },
  ],
  decisions: [
    dec("human:desk-owner", "approve:prop:1", SAMPLE_NOW - 48_000, "Test plan is falsifiable."),
    dec("master_brain", "approve:prop:2", SAMPLE_NOW - 13_000, "Self-approval attempt (sample)."),
    dec("human:desk-owner", "reject:prop:5", SAMPLE_NOW - 3_000, "No mechanism."),
  ],
};