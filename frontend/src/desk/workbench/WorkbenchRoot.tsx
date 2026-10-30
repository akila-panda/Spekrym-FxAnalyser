/** F15 — Research Workbench (?window=workbench). READ-ONLY: hypotheses (Brain drafts = proposals), DAG jobs,
 *  strategy versions, validation reports from IntelligenceSource.getWorkbench (mock, "sample"). No control
 *  here runs, promotes, cancels, or opens the VAULT. Status/tier = glyph + text (+ border shape). */
import { useEffect, useMemo, useState } from "react";
import { getIntelligenceSource } from "@/intel/factory";
import { SAMPLE_NOW } from "@/intel/fixtures";
import type { WorkbenchSnapshot } from "@/intel/workbenchContracts";
import { TIER_META } from "@/desk/analytics/board";
import { evidenceHref, JOB_META, viewWorkbench } from "./workbench";
import "@/styles/workbench.css";

type Load = { s: "loading" } | { s: "error" } | { s: "ready"; snap: WorkbenchSnapshot; kind: string };

export function WorkbenchRoot({ asOf = SAMPLE_NOW }: { asOf?: number }) {
  const [load, setLoad] = useState<Load>({ s: "loading" });
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    getIntelligenceSource().getWorkbench()
      .then((r) => { if (live) setLoad({ s: "ready", snap: r.data, kind: r.provenance.kind }); })
      .catch(() => { if (live) setLoad({ s: "error" }); });
    return () => { live = false; };
  }, []);

  const view = useMemo(() => (load.s === "ready" ? viewWorkbench(load.snap, asOf) : null), [load, asOf]);
  const sel = view?.hypotheses.find((h) => h.h.id === selected) ?? null;
  const inSel = (hid?: string) => !sel || hid === sel.h.id;

  return (
    <main className="wb-root" aria-label="Research workbench">
      <header className="wb-head">
        <strong>Research workbench</strong>
        <span className="dk-sample">{load.s === "ready" && load.kind !== "sample" ? load.kind : "sample"}</span>
        <span className="dk-muted">Read-only — the Judge decides; nothing here runs, promotes, or opens the VAULT.</span>
      </header>
      {load.s === "loading" && <p role="status">Loading workbench…</p>}
      {load.s === "error" && <p role="alert">Workbench could not be loaded.</p>}
      {view && (
        <div className="wb-grid">
          <section className="wb-col" aria-label="Hypotheses">
            <h3>Hypotheses</h3>
            <ul className="wb-list">
              {view.hypotheses.length === 0 && <li className="dk-muted">No hypotheses known at this time.</li>}
              {view.hypotheses.map((x) => (
                <li key={x.h.id}>
                  <button type="button" className="wb-row" data-proposal={x.proposal} aria-current={x.h.id === selected ? "true" : undefined}
                    onClick={() => setSelected(x.h.id === selected ? null : x.h.id)}>
                    <span className="wb-tag">{x.proposal ? "◇ Proposal (Master Brain)" : "▢ Human draft"}</span>
                    <span>{x.h.hypothesis}</span>
                    <span className="wb-muted">{x.tested ? "has validation report" : "not yet tested"}</span>
                  </button>
                </li>
              ))}
            </ul>
            {sel && <p className="wb-note" role="note">Test plan: {sel.h.testPlan}{sel.proposal ? " — a proposal; it has no verdict until the Judge rules." : ""}</p>}
          </section>

          <section className="wb-col" aria-label="Jobs">
            <h3>Jobs (dependency order)</h3>
            <ul className="wb-list">
              {view.jobs.filter((j) => inSel(j.node.hypothesisId)).length === 0 && <li className="dk-muted">No jobs known at this time.</li>}
              {view.jobs.filter((j) => inSel(j.node.hypothesisId)).map((j) => (
                <li key={j.node.job.id} className="wb-job" data-status={j.status} style={{ marginLeft: j.depth * 12 }}>
                  <span aria-hidden="true">{JOB_META[j.status].glyph}</span>
                  <span>{j.node.label}</span>
                  <span className="wb-status">{JOB_META[j.status].label}{j.progress !== undefined ? ` ${Math.round(j.progress * 100)}%` : ""}</span>
                  {j.waitingOn.length > 0 && <span className="wb-muted">waiting on {j.waitingOn.join(", ")}</span>}
                  {j.error && <span className="wb-err" role="alert">{j.error}</span>}
                  {j.evidenceExperimentId && <a href={evidenceHref(j.evidenceExperimentId)} target="_blank" rel="noreferrer" aria-label={`Open chart evidence for ${j.node.label}`}>chart evidence ↗</a>}
                </li>
              ))}
            </ul>
          </section>

          <section className="wb-col" aria-label="Strategy versions">
            <h3>Strategy versions</h3>
            <ul className="wb-list">
              {view.strategies.length === 0 && <li className="dk-muted">No strategy versions known at this time.</li>}
              {view.strategies.map((s) => (
                <li key={`${s.sv.strategyId}@${s.sv.version}`} className="wb-strat" data-tier={s.tier}>
                  <span aria-hidden="true">{TIER_META[s.tier].glyph}</span>
                  <span>{s.sv.strategyId} @ {s.sv.version}</span>
                  <span className="wb-muted">{TIER_META[s.tier].label}</span>
                  {s.downgrade && <span className="wb-warn" role="note">⚠ {s.downgrade}</span>}
                </li>
              ))}
            </ul>
          </section>

          <section className="wb-col" aria-label="Validation reports">
            <h3>Validation reports</h3>
            <ul className="wb-list">
              {view.reports.length === 0 && <li className="dk-muted">No validation reports known at this time.</li>}
              {view.reports.filter((r) => inSel(r.r.hypothesisId)).map((x) => (
                <li key={x.r.id} className="wb-report">
                  <strong>{x.label}</strong>
                  <span className="wb-muted">FDR α {x.r.fdr_alpha}; raw p-values are corrected over all tested variants</span>
                  {x.r.verdicts.map((v, i) => (
                    <span key={i}>{v.status === "PASS" ? "✓" : v.status === "FAIL" ? "✕" : "?"} {v.status} · n={v.n_trades}{v.n_trades < 30 ? " (low sample — no performance claim)" : ""}</span>
                  ))}
                  <a href={evidenceHref(x.r.experimentId)} target="_blank" rel="noreferrer" aria-label={`Open chart evidence for report ${x.r.id}`}>chart evidence ↗</a>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </main>
  );
}