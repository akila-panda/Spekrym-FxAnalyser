/** F18 — frozen "sample" Ops snapshot. Includes records the board must not trust: a feed whose last reading says
 *  fresh but whose data is stale at as-of, a calendar feed with a gap, and a model claimed calibrated while drifting. */
import type { OpsSnapshot } from "./opsContracts";
import { SAMPLE_NOW as N } from "./fixtures";

export const SAMPLE_OPS: OpsSnapshot = {
  feeds: [
    { feed_id: "candles:EUR_USD", label: "EUR/USD candles", kind: "candles", instrument: "EUR_USD", at: N - 60, lastDataAt: N - 60, staleAfterSec: 300, qualityScore: 0.99, minQuality: 0.9, gaps: [], affectsDecisions: true },
    { feed_id: "candles:GBP_USD", label: "GBP/USD candles", kind: "candles", instrument: "GBP_USD", at: N - 20_000, lastDataAt: N - 20_000, staleAfterSec: 300, qualityScore: 0.98, minQuality: 0.9, gaps: [], affectsDecisions: true },
    { feed_id: "candles:GBP_USD", label: "GBP/USD candles", kind: "candles", instrument: "GBP_USD", at: N - 900, lastDataAt: N - 900, staleAfterSec: 300, qualityScore: 0.97, minQuality: 0.9, gaps: [], affectsDecisions: true },
    { feed_id: "calendar:macro", label: "Macro calendar", kind: "calendar", at: N - 120, lastDataAt: N - 120, staleAfterSec: 3600, qualityScore: 0.82, minQuality: 0.9, gaps: [{ from: N - 7_200, to: N - 5_400 }], affectsDecisions: true },
    { feed_id: "news:wire", label: "News wire", kind: "news", at: N - 30, lastDataAt: N - 30, staleAfterSec: 600, qualityScore: 0.95, minQuality: 0.9, gaps: [], affectsDecisions: false },
  ],
  broker: [
    { broker: "paper-broker", at: N - 10_000, lastSyncAt: N - 10_000, staleAfterSec: 120, connected: true, discrepancies: 0, note: "" },
    { broker: "paper-broker", at: N - 40, lastSyncAt: N - 40, staleAfterSec: 120, connected: true, discrepancies: 1, note: "1 position differs from the local ledger" },
  ],
  jobs: [
    { job_id: "job:backfill", kind: "data backfill", queuedAt: N - 9_000, startedAt: N - 8_900, finishedAt: N - 8_000, expectedSec: 1_200 },
    { job_id: "job:regime", kind: "regime recompute", queuedAt: N - 7_000, startedAt: N - 6_900, finishedAt: N - 6_500, error: "input gap at 2025-05-09T20:00Z", expectedSec: 600 },
    { job_id: "job:drift", kind: "drift check", queuedAt: N - 5_000, startedAt: N - 4_900, expectedSec: 6_000 },
    { job_id: "job:nightly", kind: "nightly validation", queuedAt: N - 100, expectedSec: 3_600 },
  ],
  drift: [
    { model_id: "regime-v1", version: "1.0", at: N - 20_000, driftScore: 0.2, driftLimit: 1, calibrationError: 0.03, calibrated: true },
    { model_id: "regime-v1", version: "1.0", at: N - 500, driftScore: 0.85, driftLimit: 1, calibrationError: 0.09, calibrated: true },
    { model_id: "fcst-v0", version: "0.3", at: N - 500, driftScore: 1.3, driftLimit: 1, calibrationError: 0.21, calibrated: false },
  ],
};