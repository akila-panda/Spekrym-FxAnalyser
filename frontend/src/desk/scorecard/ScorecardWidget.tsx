/** DESK DK19 — Level scorecard (Review). Exploratory, descriptive, sample. Counts k/n with Wilson 95 % intervals; groups with
 *  n < 20 are suppressed. Computes only on request. Real labelled controls; meaning by text, never colour alone. */
import { useMemo, useState } from "react";
import { useActiveMethodology } from "@/desk/methodology/methodologyStore";
import { METRICS, MIN_N, PROTOCOL_NOTE, type MetricId } from "./protocol";
import { useScorecardStore } from "./scorecardStore";
import { aggregate, DIM_LABEL, type Dim, type Row } from "./stats";
import "@/styles/desk-scorecard.css";

const pct = (x: number): string => `${Math.round(x * 100)}%`;
const DIMS: Dim[] = ["type", "pair", "session", "tf", "cohort"];

function cells(r: Row): [string, string] {
  if (r.suppressed) return [`suppressed (n<${MIN_N})`, "—"];
  return [pct(r.rate as number), `${pct(r.lo as number)}–${pct(r.hi as number)}`];
}

export function ScorecardBody() {
  const meth = useActiveMethodology();
  const { status, progress, rulesVersion, obs, run } = useScorecardStore();
  const [metric, setMetric] = useState<MetricId>("fvgFill");
  const [dim, setDim] = useState<Dim>("type");
  const def = METRICS.find((m) => m.id === metric)!;
  const dimOk = dim !== "cohort" || metric === "reaction";
  const rows = useMemo(() => aggregate(obs, metric, dimOk ? dim : "type"), [obs, metric, dim, dimOk]);
  const stale = status === "done" && rulesVersion !== meth.rulesVersion;
  return (
    <div className="dk-score">
      <p className="dk-muted">
        <span className="dk-sample">sample</span> <span className="dk-sample">exploratory</span> {PROTOCOL_NOTE}
      </p>
      <div className="dk-score-bar">
        <button type="button" onClick={() => { void run(meth.cfg, meth.rulesVersion); }} disabled={status === "running"} aria-busy={status === "running"}>
          {status === "done" ? "Recompute" : "Compute scorecard"}
        </button>
        {status === "running" && <span role="status">Computing… {Math.round(progress * 100)}%</span>}
        {status === "done" && <span className="dk-muted">rulesVersion {rulesVersion} · {obs.length} observations</span>}
      </div>
      {stale && <p className="dk-pin" role="status">Computed with an earlier methodology version ({rulesVersion}); active is {meth.rulesVersion} — recompute.</p>}
      {status !== "done" ? (
        <p className="dk-muted">{status === "running" ? "Detecting all pairs and timeframes…" : "Not computed yet — counts appear here after you compute."}</p>
      ) : (
        <>
          <div className="dk-seg" role="group" aria-label="Scorecard metric">
            {METRICS.map((m) => <button key={m.id} type="button" aria-pressed={metric === m.id} onClick={() => setMetric(m.id)}>{m.label}</button>)}
          </div>
          <label className="dk-score-row">Group by
            <select value={dimOk ? dim : "type"} onChange={(e) => setDim(e.target.value as Dim)} aria-label="Group by">
              {DIMS.filter((d) => d !== "cohort" || metric === "reaction").map((d) => <option key={d} value={d}>{DIM_LABEL[d]}</option>)}
            </select>
          </label>
          <p className="dk-muted">{def.question}</p>
          {rows.length === 0 ? <p className="dk-muted">No observations with a fully observable window for this metric.</p> : (
            <table className="dk-score-table">
              <caption>{def.label} — observed share by {DIM_LABEL[dimOk ? dim : "type"].toLowerCase()} (Wilson 95% interval)</caption>
              <thead><tr><th scope="col">Group</th><th scope="col">k / n</th><th scope="col">Observed share</th><th scope="col">95% interval</th></tr></thead>
              <tbody>
                {rows.map((r) => { const [a, b] = cells(r); return (
                  <tr key={r.key}><th scope="row">{r.key}</th><td>{r.k} / {r.n}</td><td>{a}</td><td>{b}</td></tr>
                ); })}
              </tbody>
            </table>
          )}
          <p className="dk-muted">Row-to-row differences are not tuning signals: many groupings, one sample history.</p>
        </>
      )}
    </div>
  );
}