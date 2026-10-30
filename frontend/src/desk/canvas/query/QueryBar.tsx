/** F19 — Visual Query bar. Deterministic: the same text + as-of always yields the same ops. Focuses existing overlays,
 *  opens their evidence, never hides anything and never draws. Rehydrates with the replay cursor. "sample". */
import { useEffect, useMemo, useState } from "react";
import type { AnalysisObject } from "@/desk/types/schemas";
import type { ComposedOverlay } from "../pipeline";
import { IDENTITY, type EngineItem } from "../integration/engineLayer";
import { runQuery } from "./query";
import "@/styles/query.css";

const hm = (t: number) => new Date(t * 1000).toISOString().slice(11, 16) + "Z";

interface Props {
  overlays: readonly ComposedOverlay[]; items: readonly EngineItem[]; objects: readonly AnalysisObject[]; asOf: number;
  onFocus?: (keys: string[]) => void;
  onItemFocus?: (ids: string[]) => void;
}

export function QueryBar({ overlays, items, objects, asOf, onFocus, onItemFocus }: Props) {
  const [draft, setDraft] = useState("");
  const [submitted, setSubmitted] = useState<string | null>(null);
  const r = useMemo(() => (submitted === null ? null : runQuery(submitted, { overlays, items, objects, asOf })), [submitted, overlays, items, objects, asOf]);
  const focusKeys = useMemo(() => (r ? r.ops.flatMap((o) => (o.op === "focus" ? [o.key] : [])) : []), [r]);
  const sig = focusKeys.join("|");
  useEffect(() => { onFocus?.(focusKeys); }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps
  const itemIds = useMemo(() => r?.items.map(i => i.id) ?? [], [r]);
  const itemSig = itemIds.join("|");
  useEffect(() => { onItemFocus?.(itemIds); }, [itemSig, onItemFocus]);
  const win = r?.ops.find((o) => o.op === "time_range");
  const submit = (e: { preventDefault(): void }) => { e.preventDefault(); if (draft.trim()) setSubmitted(draft.trim()); };
  const clear = () => { setSubmitted(null); setDraft(""); };

  return (
    <section className="vq-root" aria-label="Visual query">
      <form className="vq-form" role="search" aria-label="Visual query form" onSubmit={submit}>
        <label className="vq-label">Visual query
          <input type="text" className="vq-input" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="e.g. show liquidity sweeps in the last 2 hours" />
        </label>
        <button type="submit" className="vq-btn" disabled={!draft.trim()}>Ask</button>
        <button type="button" className="vq-btn" onClick={clear} disabled={submitted === null}>Clear query</button>
        <span className="dk-sample">sample</span>
      </form>
      <div className="vq-out" role="status" aria-live="polite">
        {r && (
          <>
            <p className="vq-read">Read as: {r.understood.length ? r.understood.join(" · ") : "nothing recognised"}{win && win.op === "time_range" ? ` · window ${hm(win.from)}–${hm(win.to)}` : ""}</p>
            {r.unmatched.length > 0 && <p className="vq-muted">Not understood (ignored): {r.unmatched.join(", ")}</p>}
            {r.rejected.map((x) => <p key={x} className="vq-warn" role="alert">✕ rejected: {x}</p>)}
            {r.understood.length > 0 && r.overlays.length === 0 && r.items.length === 0 && <p className="vq-muted">No matching verified objects at this time.</p>}
            {r.overlays.length > 0 && (
              <ul className="vq-list" aria-label="Focused overlays">
                {r.overlays.map((o) => (
                  <li key={o.key} className="vq-item" data-focused="true">
                    <span>◎ Focused: {o.kind} · {o.sources.join(", ")}</span>
                    <span className="vq-muted">{o.primary.evidenceIds.length ? `evidence: ${o.primary.evidenceIds.join(", ")}` : "no linked evidence recorded"} · objects: {o.primary.objectIds.join(", ") || "none"}</span>
                  </li>
                ))}
              </ul>
            )}
            {r.items.length > 0 && (
              <ul className="vq-list" aria-label="Matching engine items">
                {r.items.map((i) => (
                  <li key={i.id} className="vq-item" data-border={IDENTITY[i.evidenceType].border}>
                    <span aria-hidden="true">{IDENTITY[i.evidenceType].glyph}</span> {i.engine} · {i.label} · {hm(i.t)}
                    <span className="vq-muted"> · {IDENTITY[i.evidenceType].name} · {i.surface === "chart" ? "on chart" : "context only"}{i.p0 ? " · ⚠ P0" : ""}</span>
                  </li>
                ))}
              </ul>
            )}
            {(r.overlays.length > 0 || r.items.length > 0) && <p className="vq-muted">{r.overlays.length} overlay{r.overlays.length === 1 ? "" : "s"} focused · {r.items.length} engine item{r.items.length === 1 ? "" : "s"} · nothing is hidden; P0 stays visible.</p>}
          </>
        )}
      </div>
    </section>
  );
}