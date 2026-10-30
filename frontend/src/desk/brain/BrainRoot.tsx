/** F16 — Master Brain Console (?window=brain). READ-ONLY. Proposals are shown AS proposals; approvals are
 *  server-side human AuthorizationDecisions this console can only display. No control approves, promotes,
 *  grants, registers, or reaches the VAULT. State = glyph + text (+ border shape). Mock data labelled sample. */
import { useEffect, useMemo, useState } from "react";
import { getIntelligenceSource } from "@/intel/factory";
import { SAMPLE_NOW } from "@/intel/fixtures";
import type { BrainConsoleSnapshot } from "@/intel/brainContracts";
import { CAP_LABEL, STATE_META, viewConsole, workbenchHref } from "./console";
import "@/styles/brain.css";

type Load = { s: "loading" } | { s: "error" } | { s: "ready"; snap: BrainConsoleSnapshot; kind: string };
const fmt = (t: number) => new Date(t * 1000).toISOString().slice(0, 16).replace("T", " ") + "Z";
const KIND = { hypothesis: "Hypothesis", strategy_spec: "Strategy spec", experiment_batch: "Experiment batch" } as const;

export function BrainRoot({ asOf = SAMPLE_NOW }: { asOf?: number }) {
  const [load, setLoad] = useState<Load>({ s: "loading" });
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    getIntelligenceSource().getBrain()
      .then((r) => { if (live) setLoad({ s: "ready", snap: r.data, kind: r.provenance.kind }); })
      .catch(() => { if (live) setLoad({ s: "error" }); });
    return () => { live = false; };
  }, []);

  const v = useMemo(() => (load.s === "ready" ? viewConsole(load.snap, asOf) : null), [load, asOf]);
  const sel = v?.proposals.find((r) => r.p.id === selected) ?? null;

  return (
    <main className="bc-root" aria-label="Master Brain console">
      <header className="bc-head">
        <strong>Master Brain console</strong>
        <span className="dk-sample">{load.s === "ready" && load.kind !== "sample" ? load.kind : "sample"}</span>
        <span className="dk-muted">Read-only — the Brain proposes; a human authorizes server-side; the Judge decides. Nothing here approves or promotes.</span>
      </header>
      {load.s === "loading" && <p role="status">Loading console…</p>}
      {load.s === "error" && <p role="alert">Console could not be loaded.</p>}
      {v && (
        <div className="bc-grid">
          <section className="bc-col" aria-label="Research objectives">
            <h3>Research objectives</h3>
            <ul className="bc-list">
              {v.objectives.length === 0 && <li className="dk-muted">No objectives known at this time.</li>}
              {v.objectives.map((o) => (
                <li key={o.id} className="bc-item"><span>{o.text}</span><span className="bc-muted">{o.status} · {o.proposals} proposal(s)</span></li>
              ))}
            </ul>
          </section>

          <section className="bc-col" aria-label="Proposals">
            <h3>Proposals <span className="bc-muted">(not verdicts)</span></h3>
            <p className="bc-muted" role="group" aria-label="Proposal states">
              {v.stateCounts.map((c) => `${STATE_META[c.state].glyph} ${c.count}`).join("  ·  ")}
            </p>
            <ul className="bc-list">
              {v.proposals.length === 0 && <li className="dk-muted">No proposals known at this time.</li>}
              {v.proposals.map((r) => (
                <li key={r.p.id}>
                  <button type="button" className="bc-row" data-state={r.state} aria-current={r.p.id === selected ? "true" : undefined}
                    onClick={() => setSelected(r.p.id === selected ? null : r.p.id)}>
                    <span className="bc-tag">◇ Proposal · {KIND[r.p.kind]}</span>
                    <span>{r.p.title}</span>
                    <span className="bc-muted">{STATE_META[r.state].glyph} {STATE_META[r.state].label}</span>
                    {r.invalid.length > 0 && <span className="bc-warn">⚠ ignored a non-human decision by {r.invalid[0]!.actor}</span>}
                  </button>
                </li>
              ))}
            </ul>
            {sel && (
              <div className="bc-detail" role="note">
                <p>{sel.p.rationale}</p>
                {sel.decidedBy && <p>Decided by {sel.decidedBy}. An approval only authorizes registering an experiment; it is not a verdict.</p>}
                {sel.p.hypothesisId && <a href={workbenchHref} target="_blank" rel="noreferrer" aria-label={`Open ${sel.p.hypothesisId} in the research workbench`}>research workbench ↗</a>}
              </div>
            )}
          </section>

          <section className="bc-col" aria-label="Approval queue">
            <h3>Approval queue ({v.queue.length})</h3>
            <p className="bc-muted">Decisions are recorded server-side by an authorized human; this console cannot approve.</p>
            <ul className="bc-list">
              {v.queue.length === 0 && <li className="dk-muted">Nothing awaiting a human decision.</li>}
              {v.queue.map((r) => <li key={r.p.id} className="bc-item" data-state="pending"><span>◇ {r.p.title}</span><span className="bc-muted">since {fmt(r.p.proposedAt)}</span></li>)}
            </ul>
          </section>

          <section className="bc-col" aria-label="Permissions">
            <h3>Permissions</h3>
            <ul className="bc-list">
              {v.permissions.map((p) => (
                <li key={p.capability} className="bc-item" data-granted={p.granted}>
                  <span>{p.granted ? "✓ Allowed" : "✕ Denied"} — {CAP_LABEL[p.capability]}</span>
                  <span className="bc-muted">{p.reason}</span>
                  {p.overridden && <span className="bc-warn" role="note">⚠ {p.overridden}</span>}
                </li>
              ))}
            </ul>
          </section>

          <section className="bc-col" aria-label="Budgets">
            <h3>Budgets</h3>
            <ul className="bc-list">
              {v.budgets.length === 0 && <li className="dk-muted">No budgets observed at this time.</li>}
              {v.budgets.map((x) => (
                <li key={x.b.id} className="bc-item" data-state={x.state}>
                  <span>{x.b.resource.replace("_", " ")} per {x.b.window}: {x.b.used}/{x.b.limit}</span>
                  <meter min={0} max={x.b.limit} value={Math.min(x.b.used, x.b.limit)} aria-label={`${x.b.resource} budget used`} />
                  <span>{x.label}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="bc-col" aria-label="Authorization log">
            <h3>Authorization log</h3>
            <ul className="bc-list">
              {v.log.length === 0 && <li className="dk-muted">No decisions recorded at this time.</li>}
              {v.log.map((d, i) => (
                <li key={i} className="bc-item" data-valid={d.valid}>
                  <span>{d.valid ? "✓" : "✕ not counted"} {d.actor} · {d.action}</span>
                  <span className="bc-muted">{fmt(d.timestamp)} — {d.rationale}{d.valid ? "" : " (only a human actor can authorize)"}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </main>
  );
}