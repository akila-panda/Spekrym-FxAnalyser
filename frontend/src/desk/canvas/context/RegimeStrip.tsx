/** F9 — Regime strip + family context panels. Presentational; props carry the series and the viewed time so
 *  nothing renders before it was knowable. Qualitative text + glyphs (never colour alone); "sample". */
import type { RegimeSnapshot } from "@/intel/contracts";
import { describeRegime, familyPanels, regimeAt, regimeWarning, stripSegments } from "./regime";

const GLYPH: Record<RegimeSnapshot["structure_state"], string> = { trend: "▲", range: "▬", compression: "◆", transition: "↻" };

export function RegimeStrip({ series, asOf, instrument }: { series: readonly RegimeSnapshot[]; asOf: number; instrument?: string }) {
  const segs = stripSegments(series, asOf, instrument);
  const cur = regimeAt(series, asOf, instrument);
  const d = cur ? describeRegime(cur) : null;
  const warn = regimeWarning(cur);
  return (
    <section className="vc-regime" aria-label="Regime strip">
      <span className="vc-regime-title">Regime <span className="dk-sample">sample</span></span>
      {segs.length === 0 ? (
        <span className="dk-muted">No regime known yet at this time.</span>
      ) : (
        <ol className="vc-regime-segs" aria-label="Regime history">
          {segs.map((s) => (
            <li key={s.id} className="vc-regime-seg" aria-current={s.current ? "true" : undefined} data-degraded={s.degraded}>
              <span aria-hidden="true">{GLYPH[s.state]}</span> {s.state}{s.degraded ? " (degraded)" : ""}
            </li>
          ))}
        </ol>
      )}
      {d && (
        <div className="vc-regime-groups">
          <span aria-label="Regime state">Regime: {d.regime.structure} · vol {d.regime.volatility} · trend {d.regime.trend} · momentum {d.regime.momentum}</span>
          <span aria-label="Higher-timeframe alignment">HTF alignment: {d.htf.alignment}</span>
          <span aria-label="Execution conditions">Execution: data {d.execution.dataQuality} · transition risk {d.execution.transitionRisk}</span>
        </div>
      )}
      {warn && <strong className="vc-regime-warn" role="alert">⚠ {warn}</strong>}
    </section>
  );
}

export function FamilyPanels({ series, asOf, instrument }: { series: readonly RegimeSnapshot[]; asOf: number; instrument?: string }) {
  const panels = familyPanels(regimeAt(series, asOf, instrument));
  return (
    <section className="vc-panel" aria-label="Context panels">
      <h4>Context <span className="dk-sample">sample</span></h4>
      <ul className="vc-sources">
        {panels.map((p) => (
          <li key={p.id} className="vc-family" aria-label={`Family ${p.title}`} data-status={p.status}>
            <strong>{p.title}</strong>
            {p.status === "ok"
              ? p.rows.map((r) => <span key={r.label} className="vc-source-state">{r.label}: {r.value}</span>)
              : <span className="vc-source-state">{p.note}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}