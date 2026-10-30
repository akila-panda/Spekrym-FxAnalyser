/** DESK DK3 — "Why am I seeing this?" Right drawer (key E, Esc closes) and inline widget body.
 *  Reads only the selected object's own data (+ relations/ids from analysisStore). Depth follows complexity. */
import { useEffect, useMemo, useRef } from "react";
import { useAnalysisStore } from "@/desk/detect/analysisStore";
import { useDeskStore } from "@/desk/workspace/deskStore";
import { useDeskUiStore } from "@/desk/workspace/deskUiStore";
import { DEPTH_FOR, describeObject } from "./describe";

function Section({ title, lines }: { title: string; lines: string[] }) {
  return (
    <section className="dk-ev-sec" aria-label={title}>
      <h4>{title}</h4>
      {lines.length ? <ul>{lines.map((l, i) => <li key={i}>{l}</li>)}</ul> : <p className="dk-muted">None recorded.</p>}
    </section>
  );
}

export function EvidenceBody() {
  const id = useDeskUiStore((s) => s.selectedObjectId);
  const complexity = useDeskStore((s) => s.complexity);
  const { objects, relations, viewTf, confluence } = useAnalysisStore();
  const obj = useMemo(() => objects.find((o) => o.id === id) ?? null, [objects, id]);
  const byId = useMemo(() => new Map(objects.map((o) => [o.id, o])), [objects]);
  if (!obj) return <p className="dk-muted">Select an object on the chart, then press E.</p>;
  const depth = DEPTH_FOR[complexity];
  const d = describeObject(obj, depth, { viewTf: (viewTf ?? undefined) as never, relations, byId, confluence: confluence.byObject[obj.id] });
  return (
    <div className="dk-evidence">
      <p><strong>{d.headline}</strong> <span className="dk-sample">{obj.provenance.dataKind}</span></p>
      {depth !== "headline" && (
        <>
          <Section title="Why shown" lines={d.explanation} />
          <Section title="Supports" lines={d.supports} />
          <Section title="Conflicts" lines={d.conflicts} />
        </>
      )}
      {depth === "evidence" && (
        <>
          <Section title="Timing & lifecycle" lines={d.timing} />
          <Section title="Data quality" lines={d.quality} />
          <Section title="Relations" lines={d.relations} />
        </>
      )}
    </div>
  );
}

export function EvidenceDrawer() {
  const open = useDeskUiStore((s) => s.evidenceOpen);
  const id = useDeskUiStore((s) => s.selectedObjectId);
  const setEvidence = useDeskUiStore((s) => s.setEvidence);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (open) closeRef.current?.focus(); }, [open]);
  if (!open || !id) return null;
  return (
    <aside className="dk-drawer" aria-label="Evidence">
      <header className="dk-widget-head">
        <strong>Why am I seeing this?</strong>
        <button ref={closeRef} type="button" className="dk-icon" aria-label="Close evidence" onClick={() => setEvidence(false)}>✕</button>
      </header>
      <div className="dk-widget-body"><EvidenceBody /></div>
    </aside>
  );
}