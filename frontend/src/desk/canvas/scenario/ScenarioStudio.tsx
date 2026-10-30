/** F11 — Scenario Studio panel. Lists causal scenarios (Category B ◇ dashed / Category C ▣ double border —
 *  never interchangeable), shows branches with triggers + invalidation (P0, always visible), and a chart-focus
 *  figure for the selected branch. No probabilities unless a calibrated model backs them. Tokens only; "sample". */
import type { AnalysisObject } from "@/desk/types/schemas";
import type { ForecastDistribution, ScenarioSpecification, ScenarioState } from "@/intel/contracts";
import { buildStudio, scenarioFocus } from "./studio";
import { useScenarioStore } from "./scenarioStore";

const CAT = { B: { glyph: "◇", text: "Conditional scenario (hypothesis)" }, C: { glyph: "▣", text: "Statistical forecast" } } as const;
const STATUS_GLYPH: Record<string, string> = { proposed: "○", active: "●", triggered: "◉", invalidated: "✕", expired: "—" };
const fmt = (t: number) => new Date(t * 1000).toISOString().slice(0, 16).replace("T", " ") + "Z";

export function ScenarioStudio(props: {
  specs: readonly ScenarioSpecification[]; states: readonly ScenarioState[]; forecasts: readonly ForecastDistribution[];
  objects: readonly AnalysisObject[]; asOf: number;
}) {
  const { specs, states, forecasts, objects, asOf } = props;
  const views = buildStudio(specs, states, forecasts, asOf);
  const scenarioId = useScenarioStore((s) => s.scenarioId);
  const branchIdx = useScenarioStore((s) => s.branch);
  const select = useScenarioStore((s) => s.select);
  const selectBranch = useScenarioStore((s) => s.selectBranch);
  const sel = views.find((v) => v.id === scenarioId) ?? null;
  const focus = scenarioFocus(sel, branchIdx, objects, asOf);
  const p0 = views.filter((v) => v.invalidated);

  return (
    <section className="vc-scn" aria-label="Scenario Studio">
      <h4>Scenario Studio <span className="dk-sample">sample</span></h4>
      <p className="dk-muted">Hypotheses under stated conditions — not predictions.</p>
      {p0.length > 0 && <strong className="vc-scn-p0" role="alert">⚠ Invalidated: {p0.map((v) => v.id).join(", ")}</strong>}
      {views.length === 0 ? <p className="dk-muted">No scenario known at this time.</p> : (
        <ul className="vc-sources">
          {views.map((v) => (
            <li key={v.id}>
              <button type="button" className="vc-scn-item" data-cat={v.category} aria-pressed={sel?.id === v.id}
                aria-label={`Scenario ${v.id} — ${CAT[v.category].text}`} onClick={() => select(sel?.id === v.id ? null : v.id)}>
                <span aria-hidden="true">{CAT[v.category].glyph}</span> <span>{v.id} · v{v.version}</span>
                <span className="vc-source-state">{CAT[v.category].text} · {STATUS_GLYPH[v.status]} {v.status}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {sel && (
        <div className="vc-scn-detail" data-cat={sel.category} aria-label={`Scenario ${sel.id} detail`}>
          {sel.history.length > 0 && <p className="dk-muted">Revised: {sel.history.map((h) => `v${h.version} (${fmt(h.asOf)})`).join(", ")} → v{sel.version}</p>}
          <div className="vc-seg" role="group" aria-label="Branch">
            {sel.branches.map((b) => (
              <button key={b.index} type="button" aria-pressed={branchIdx === b.index} onClick={() => selectBranch(b.index)}>{b.label}</button>
            ))}
          </div>
          {sel.branches.filter((b) => b.index === branchIdx).map((b) => (
            <div key={b.index} className="vc-scn-branch">
              <strong>{STATUS_GLYPH[b.status]} {b.label} — {b.status}</strong>
              <ul className="vc-scn-list" aria-label="Triggers">
                {b.conditions.map((c) => <li key={c.text}>{c.fired ? "✓" : "○"} If {c.text}{c.fired ? " (fired)" : ""}</li>)}
              </ul>
              <p className={b.invalidation.broken ? "vc-scn-p0" : "vc-scn-inv"} aria-label="Invalidation">
                ⚠ Invalidated if: {b.invalidation.text}{b.invalidation.broken ? " — BROKEN" : ""}
              </p>
              <p className="dk-muted">Expires {fmt(b.expiry)}</p>
            </div>
          ))}
          {sel.category === "C" && sel.forecast && (
            <div className="vc-scn-forecast" aria-label="Forecast">
              {sel.forecast.state === "calibrated" ? (
                <>
                  <strong>{forecasts.some(f => f.modelVersion === "synthetic-demo" && specs.some(s => s.id === sel.id && s.modelRef === f.modelRef)) ? "Synthetic forecast display — demo calibration only" : "Calibrated forecast"}</strong>
                  <p className="dk-muted">OOS reliability {sel.forecast.calibration!.oosReliability} · n={sel.forecast.calibration!.sampleSize}</p>
                  {sel.forecast.distribution && <ul className="vc-scn-list">{Object.entries(sel.forecast.distribution).map(([k, p]) => <li key={k}>{k}: {p}</li>)}</ul>}
                  {sel.forecast.interval && <p>Interval {sel.forecast.interval.lo} – {sel.forecast.interval.hi}</p>}
                </>
              ) : (
                <p role="note">⚠ {sel.forecast.reason}</p>
              )}
            </div>
          )}
          <figure className="vc-scn-chart" data-cat={sel.category} aria-label="Chart focus">
            <figcaption>Chart focus — {sel.category === "C" ? "forecast" : "conditional"} · {focus.primitives.length} drawn</figcaption>
            <ul className="vc-scn-list">
              {focus.primitives.map((p, i) => <li key={i}>{p.kind}{"price" in p && p.price !== undefined ? ` @ ${p.price}` : ""}</li>)}
              {focus.unresolved.map((r) => <li key={r} className="dk-muted">no drawable geometry: {r}</li>)}
              {focus.primitives.length === 0 && focus.unresolved.length === 0 && <li className="dk-muted">No geometry — shown as text only.</li>}
            </ul>
          </figure>
        </div>
      )}
    </section>
  );
}