/** F13 — Cross-engine layer panel. One list of every engine's output with the 5 evidence-type identities
 *  (glyph + name + border shape, never colour alone). Items without real geometry say "context only".
 *  P0 items are always listed first. Discretionary ≠ validated is stated in text. "sample". */
import type { EngineItem } from "./engineLayer";
import { EVIDENCE_TYPES, IDENTITY } from "./engineLayer";

const fmt = (t: number) => new Date(t * 1000).toISOString().slice(11, 16) + "Z";

export function EngineLayer({ items, onFocus }: { items: readonly EngineItem[]; onFocus?: (id: string) => void }) {
  return (
    <section className="vc-panel vc-eng" aria-label="Cross-engine layer">
      <h4>Cross-engine intelligence <span className="dk-sample">sample</span></h4>
      <ul className="vc-eng-legend" aria-label="Evidence types">
        {EVIDENCE_TYPES.map((t) => (
          <li key={t} className="vc-eng-key" data-type={t} data-border={IDENTITY[t].border}>
            <span aria-hidden="true">{IDENTITY[t].glyph}</span> {IDENTITY[t].name}
          </li>
        ))}
      </ul>
      {items.length === 0 ? <p className="dk-muted">Nothing knowable at this time.</p> : (
        <ul className="vc-sources" aria-label="Engine items">
          {items.map((i) => (
            <li key={i.id} className="vc-eng-item" data-type={i.evidenceType} data-engine={i.engine} data-border={IDENTITY[i.evidenceType].border} data-p0={i.p0}>
              {onFocus && <button type="button" onClick={() => onFocus(i.id)} aria-label={`Locate ${i.label}`}>◎ Locate</button>}
              <span aria-hidden="true">{IDENTITY[i.evidenceType].glyph}</span>{" "}
              <strong>{i.engine}</strong> · {i.label} · {fmt(i.t)}
              <span className="vc-source-state">
                {" "}{IDENTITY[i.evidenceType].name} · {i.surface === "chart" ? "on chart" : "context only"}
                {i.p0 ? " · ⚠ P0" : ""}{i.discretionary ? " · discretionary — not validated" : ""}
                {i.hypothetical ? " · hypothetical" : ""}{i.proposal ? " · proposal" : ""}
                {i.note ? ` · ${i.note}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}