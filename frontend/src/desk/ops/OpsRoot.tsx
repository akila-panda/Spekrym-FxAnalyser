/** F18 — Ops & Data Observatory (?window=ops). READ-ONLY / observe (D6): no control restarts, reconnects, backfills or
 *  silences anything. P0 alerts are always shown; the expert toggle only reveals raw metrics (display-only, ephemeral). */
import { useEffect, useMemo, useState } from "react";
import { getIntelligenceSource } from "@/intel/factory";
import { SAMPLE_NOW } from "@/intel/fixtures";
import type { OpsSnapshot } from "@/intel/opsContracts";
import { BROKER_META, DRIFT_LABEL, FEED_META, JOB_META, viewOps, type FeedState } from "./ops";
import "@/styles/ops.css";

type Load = { s: "loading" } | { s: "error" } | { s: "ready"; snap: OpsSnapshot; kind: string };
const fmt = (t: number) => new Date(t * 1000).toISOString().slice(0, 16).replace("T", " ") + "Z";
const age = (s: number) => (s < 120 ? `${s}s` : `${Math.round(s / 60)} min`);
const STATES: FeedState[] = ["stale", "degraded", "ok"];

export function OpsRoot({ asOf = SAMPLE_NOW }: { asOf?: number }) {
  const [load, setLoad] = useState<Load>({ s: "loading" });
  const [expert, setExpert] = useState(false);

  useEffect(() => {
    let live = true;
    getIntelligenceSource().getOps()
      .then((r) => { if (live) setLoad({ s: "ready", snap: r.data, kind: r.provenance.kind }); })
      .catch(() => { if (live) setLoad({ s: "error" }); });
    return () => { live = false; };
  }, []);

  const v = useMemo(() => (load.s === "ready" ? viewOps(load.snap, asOf) : null), [load, asOf]);

  return (
    <main className="ops-root" aria-label="Ops and Data Observatory">
      <header className="ops-head">
        <strong>Ops &amp; Data Observatory</strong>
        <span className="dk-sample">{load.s === "ready" && load.kind !== "sample" ? load.kind : "sample"}</span>
        <span className="dk-muted">Observe-only (D6) — nothing here restarts, reconnects, backfills or silences an alert.</span>
        <button type="button" className="ops-toggle" aria-pressed={expert} onClick={() => setExpert((e) => !e)}>
          {expert ? "◉" : "○"} Expert detail {expert ? "on" : "off"}
        </button>
      </header>
      {load.s === "loading" && <p role="status">Loading operations…</p>}
      {load.s === "error" && <p role="alert">Operations data could not be loaded.</p>}
      {v && (
        <div className="ops-grid">
          <section className="ops-col ops-wide" aria-label="Ops alerts">
            <h3>Safety alerts <span className="ops-muted">(always shown)</span></h3>
            {v.alerts.length === 0 && <p className="dk-muted">● No active data or ops alerts at this time.</p>}
            <ul className="ops-list">
              {v.alerts.map((a) => <li key={a.id} className="ops-item ops-alert" role="alert" data-kind={a.kind}>⛔ {a.text}</li>)}
            </ul>
          </section>

          <section className="ops-col" aria-label="Feed quality">
            <h3>Feed quality</h3>
            <p className="ops-muted">{STATES.map((s) => `${FEED_META[s].label} ${v.feedCounts[s]}`).join(" · ")}</p>
            <ul className="ops-list">
              {v.feeds.length === 0 && <li className="dk-muted">No feed readings known at this time.</li>}
              {v.feeds.map((f) => (
                <li key={f.obs.feed_id} className="ops-item" data-state={f.state}>
                  <span>{FEED_META[f.state].glyph} {f.obs.label} — {FEED_META[f.state].label}</span>
                  <span className="ops-muted">last data {age(f.ageSec)} ago{f.reasons.length ? ` · ${f.reasons.join("; ")}` : ""}</span>
                  {expert && <span className="ops-muted">quality {f.obs.qualityScore} (min {f.obs.minQuality}) · stale after {f.obs.staleAfterSec}s · reading {fmt(f.obs.at)} · {f.obs.kind}{f.obs.gaps.map((g) => ` · gap ${fmt(g.from)}→${fmt(g.to)}`).join("")}</span>}
                </li>
              ))}
            </ul>
          </section>

          <section className="ops-col" aria-label="Broker sync">
            <h3>Broker sync</h3>
            <ul className="ops-list">
              {v.broker.length === 0 && <li className="dk-muted">No broker sync known at this time.</li>}
              {v.broker.map((b) => (
                <li key={b.obs.broker} className="ops-item" data-state={b.state}>
                  <span>{BROKER_META[b.state].glyph} {b.obs.broker} — {BROKER_META[b.state].label}</span>
                  <span className="ops-muted">last sync {age(b.ageSec)} ago · {b.obs.discrepancies} discrepanc{b.obs.discrepancies === 1 ? "y" : "ies"}{b.obs.note ? ` · ${b.obs.note}` : ""}</span>
                  {expert && <span className="ops-muted">reading {fmt(b.obs.at)} · stale after {b.obs.staleAfterSec}s</span>}
                </li>
              ))}
            </ul>
          </section>

          <section className="ops-col" aria-label="Compute jobs">
            <h3>Compute jobs ({v.jobs.length})</h3>
            <ul className="ops-list">
              {v.jobs.length === 0 && <li className="dk-muted">No jobs known at this time.</li>}
              {v.jobs.map((j) => (
                <li key={j.job.job_id} className="ops-item" data-state={j.state}>
                  <span>{JOB_META[j.state].glyph} {j.job.kind} — {JOB_META[j.state].label}</span>
                  {j.error && <span className="ops-warn" role="alert">✕ {j.error}</span>}
                  {expert && <span className="ops-muted">{j.job.job_id} · queued {fmt(j.job.queuedAt)} · expected {j.job.expectedSec}s</span>}
                </li>
              ))}
            </ul>
          </section>

          <section className="ops-col" aria-label="Model drift">
            <h3>Model drift</h3>
            <ul className="ops-list">
              {v.drift.length === 0 && <li className="dk-muted">No model drift readings known at this time.</li>}
              {v.drift.map((d) => (
                <li key={d.obs.model_id} className="ops-item" data-band={d.band}>
                  <span>{d.obs.model_id} v{d.obs.version} — drift {d.obs.driftScore} of {d.obs.driftLimit} {d.trend}</span>
                  <meter min={0} max={d.obs.driftLimit} value={Math.min(d.obs.driftScore, d.obs.driftLimit)} aria-label={`${d.obs.model_id} drift versus limit`} />
                  <span>{DRIFT_LABEL[d.band]}</span>
                  <span className="ops-muted">{d.calibrated ? "calibration holds" : "calibration not established"}</span>
                  {expert && <span className="ops-muted">calibration error {d.obs.calibrationError} · {d.history.length} reading{d.history.length === 1 ? "" : "s"} · latest {fmt(d.obs.at)}</span>}
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </main>
  );
}