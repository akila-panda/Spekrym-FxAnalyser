/** F18 — Ops & Data Observatory view (pure, read-only, causal). State is derived from raw timestamps/metrics at `asOf`
 *  (a feed that stopped reporting goes stale even if its last reading said "fresh"). Stale/degraded feeds, broker desync
 *  and drift breaches are P0 alerts — always present, never behind the expert toggle. Nothing renders before it was knowable. */
import type { BrokerSyncObservation, FeedObservation, ModelDriftObservation, OpsJob, OpsSnapshot } from "@/intel/opsContracts";
import { bandOf, type Band } from "@/desk/portfolio/portfolio";

export type FeedState = "ok" | "degraded" | "stale";
export const FEED_META: Record<FeedState, { glyph: string; label: string }> = {
  ok: { glyph: "●", label: "Healthy" }, degraded: { glyph: "⚠", label: "Degraded" }, stale: { glyph: "⛔", label: "Stale" },
};
export type BrokerState = "ok" | "mismatch" | "stale" | "disconnected";
export const BROKER_META: Record<BrokerState, { glyph: string; label: string }> = {
  ok: { glyph: "●", label: "In sync" }, mismatch: { glyph: "⚠", label: "Discrepancy" }, stale: { glyph: "⛔", label: "Sync stale" }, disconnected: { glyph: "⛔", label: "Disconnected" },
};
export type JobState = "queued" | "running" | "stalled" | "done" | "error";
export const JOB_META: Record<JobState, { glyph: string; label: string }> = {
  queued: { glyph: "◌", label: "Queued" }, running: { glyph: "◐", label: "Running" }, stalled: { glyph: "⚠", label: "Running late" }, done: { glyph: "✓", label: "Done" }, error: { glyph: "✕", label: "Error" },
};
export const DRIFT_LABEL: Record<Band, string> = { ok: "Within drift limit ●", near: "Near drift limit ⚠", breach: "Drift limit breached ✕" };

export interface FeedRow { obs: FeedObservation; state: FeedState; ageSec: number; reasons: string[] }
export interface BrokerRow { obs: BrokerSyncObservation; state: BrokerState; ageSec: number }
export interface JobRow { job: OpsJob; state: JobState; error?: string; ageSec: number }
export interface DriftRow { obs: ModelDriftObservation; band: Band; trend: "↑" | "↓" | "→" | "new"; calibrated: boolean; history: ModelDriftObservation[] }
export interface OpsAlert { id: string; kind: "feed" | "broker" | "drift"; text: string }
export interface OpsView {
  feeds: FeedRow[]; feedCounts: Record<FeedState, number>; broker: BrokerRow[]; jobs: JobRow[]; drift: DriftRow[]; alerts: OpsAlert[];
}

const STATE_ORDER: Record<FeedState, number> = { stale: 0, degraded: 1, ok: 2 };
const latestBy = <T extends { at: number }>(xs: readonly T[], key: (x: T) => string, asOf: number): T[] => {
  const m = new Map<string, T>();
  for (const x of xs) if (x.at <= asOf && (!m.has(key(x)) || m.get(key(x))!.at <= x.at)) m.set(key(x), x);
  return [...m.values()];
};

export function feedState(o: FeedObservation, asOf: number): { state: FeedState; reasons: string[] } {
  const age = asOf - o.lastDataAt;
  if (age > o.staleAfterSec) return { state: "stale", reasons: [`no data for ${Math.round(age / 60)} min (limit ${Math.round(o.staleAfterSec / 60)} min)`] };
  const reasons: string[] = [];
  if (o.qualityScore < o.minQuality) reasons.push(`quality ${o.qualityScore} below ${o.minQuality}`);
  if (o.gaps.length > 0) reasons.push(`${o.gaps.length} gap${o.gaps.length > 1 ? "s" : ""} flagged, not filled`);
  return { state: reasons.length ? "degraded" : "ok", reasons };
}

export function brokerState(o: BrokerSyncObservation, asOf: number): BrokerState {
  if (!o.connected) return "disconnected";
  if (asOf - o.lastSyncAt > o.staleAfterSec) return "stale";
  return o.discrepancies > 0 ? "mismatch" : "ok";
}

export function jobState(j: OpsJob, asOf: number): { state: JobState; error?: string } | null {
  if (j.queuedAt > asOf) return null;
  if (j.finishedAt !== undefined && j.finishedAt <= asOf) return j.error ? { state: "error", error: j.error } : { state: "done" };
  if (j.startedAt !== undefined && j.startedAt <= asOf) return { state: asOf - j.startedAt > j.expectedSec ? "stalled" : "running" };
  return { state: "queued" };
}

export function viewOps(s: OpsSnapshot, asOf: number): OpsView {
  const feeds: FeedRow[] = latestBy(s.feeds, (f) => f.feed_id, asOf).map((obs) => ({ obs, ageSec: asOf - obs.lastDataAt, ...feedState(obs, asOf) }))
    .sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state] || a.obs.feed_id.localeCompare(b.obs.feed_id));
  const feedCounts: Record<FeedState, number> = { ok: 0, degraded: 0, stale: 0 };
  for (const f of feeds) feedCounts[f.state]++;
  const broker: BrokerRow[] = latestBy(s.broker, (b) => b.broker, asOf).map((obs) => ({ obs, state: brokerState(obs, asOf), ageSec: asOf - obs.lastSyncAt }));
  const jobs: JobRow[] = s.jobs.flatMap((job) => { const j = jobState(job, asOf); return j ? [{ job, ...j, ageSec: asOf - job.queuedAt }] : []; })
    .sort((a, b) => a.job.queuedAt - b.job.queuedAt);
  const drift: DriftRow[] = latestBy(s.drift, (d) => d.model_id, asOf).map((obs) => {
    const history = s.drift.filter((d) => d.model_id === obs.model_id && d.at <= asOf).sort((a, b) => a.at - b.at);
    const prev = history[history.length - 2];
    const band = bandOf(obs.driftScore, obs.driftLimit);
    const trend = !prev ? "new" : obs.driftScore > prev.driftScore ? "↑" : obs.driftScore < prev.driftScore ? "↓" : "→";
    return { obs, band, trend, calibrated: obs.calibrated && band !== "breach", history };
  });

  const alerts: OpsAlert[] = [];
  for (const f of feeds.filter((x) => x.state !== "ok")) {
    const scope = f.obs.affectsDecisions ? "affects live decisions" : "not decision-critical";
    alerts.push({ id: `feed:${f.obs.feed_id}`, kind: "feed", text: `${FEED_META[f.state].label} feed — ${f.obs.label}: ${f.reasons.join("; ")} (${scope}).` });
  }
  for (const b of broker.filter((x) => x.state !== "ok")) alerts.push({ id: `broker:${b.obs.broker}`, kind: "broker", text: `Broker ${b.obs.broker}: ${BROKER_META[b.state].label.toLowerCase()}${b.obs.note ? ` — ${b.obs.note}` : ""}.` });
  for (const d of drift.filter((x) => x.band === "breach")) alerts.push({ id: `drift:${d.obs.model_id}`, kind: "drift", text: `Model ${d.obs.model_id} v${d.obs.version}: drift ${d.obs.driftScore} is over the ${d.obs.driftLimit} limit — calibration withheld.` });
  return { feeds, feedCounts, broker, jobs, drift, alerts };
}