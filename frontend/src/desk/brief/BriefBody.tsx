/** DESK DK13 — Decision Brief card. Minimal: state · context · next level · invalidation. Standard: + confirmation + details drawer.
 *  Advanced: + full factors. Four answers, each with an "evidence" button that selects the linked object (then E opens the drawer).
 *  Descriptive only — never buy/sell. */
import { useDeskStore } from "@/desk/workspace/deskStore";
import { useDeskUiStore } from "@/desk/workspace/deskUiStore";
import { STATE_GLYPH, type BriefAnswer } from "./buildBrief";
import { useBrief, usePublishBrief } from "./useBrief";

function Answer({ title, a }: { title: string; a: BriefAnswer }) {
  const select = useDeskUiStore((s) => s.select);
  return (
    <section className="dk-brief-ans" aria-label={title}>
      <h4>{title}</h4>
      <p>{a.text}</p>
      {a.objectId && <button type="button" className="dk-conf-row" aria-label={`Show evidence: ${title}`} onClick={() => select(a.objectId as string)}>Show evidence</button>}
    </section>
  );
}

const STATUS_GLYPH = { seen: "✓", missing: "○", unavailable: "–" } as const;

export function BriefBody() {
  const brief = useBrief();
  usePublishBrief(brief);
  const complexity = useDeskStore((s) => s.complexity);
  if (!brief) return <p className="dk-muted" aria-busy="true">Loading brief…</p>;
  return (
    <div className="dk-brief">
      <p className="dk-brief-state" role="status" aria-live="polite">
        <span aria-hidden="true">{STATE_GLYPH[brief.state]}</span> <strong>{brief.label}</strong> <span className="dk-sample">{brief.dataKind}</span>
      </p>
      <Answer title="Current context" a={brief.context} />
      <Answer title="What matters now" a={brief.matters} />
      {complexity !== "minimal" && <Answer title="What would confirm" a={brief.confirm} />}
      <Answer title="What would invalidate" a={brief.invalidate} />
      {complexity !== "minimal" && brief.confirmations.length > 0 && (
        <details className="dk-brief-more">
          <summary>Confirmation checklist</summary>
          <ul aria-label="Confirmation checklist">
            {brief.confirmations.map((c) => (
              <li key={c.id}><span aria-hidden="true">{STATUS_GLYPH[c.status]}</span> {c.label} — {c.status}</li>
            ))}
          </ul>
        </details>
      )}
      {complexity === "advanced" && (
        <details className="dk-brief-more" open>
          <summary>Factors (heuristic)</summary>
          {([["Supports", brief.factors.supports], ["Conflicts", brief.factors.conflicts], ["Unavailable", brief.factors.unavailable]] as const).map(([t, l]) => (
            <section key={t} aria-label={t}><h4>{t}</h4>{l.length ? <ul>{l.map((x, k) => <li key={k}>{x}</li>)}</ul> : <p className="dk-muted">None recorded.</p>}</section>
          ))}
        </details>
      )}
    </div>
  );
}