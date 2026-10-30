/** F20 — Attention & Decision Compression panel. Three answers (what matters / watch next / what changes) + the ranked
 *  attention list with keyboard Pin / Mute (aria-pressed; glyph + text cues, never colour alone). P0 cannot be muted.
 *  Presentation only; "sample". */
import { useMemo } from "react";
import type { ChangeEvent } from "../live/diff";
import type { EngineItem } from "../integration/engineLayer";
import type { ComposedOverlay } from "../pipeline";
import type { SessionPlan } from "../prepare/plan";
import { rankAttention } from "./attention";
import { compress, type Line } from "./compression";
import { useAttentionStore } from "./attentionStore";
import "@/styles/attention.css";

interface Props {
  items: readonly EngineItem[]; overlays: readonly ComposedOverlay[]; plan: SessionPlan | null; asOf: number;
  feed?: readonly ChangeEvent[]; feedAsOf?: number; reachedIds?: readonly string[];
}

function Answer({ title, lines }: { title: string; lines: Line[] }) {
  return (
    <section className="va-answer" aria-label={title}>
      <h5>{title}</h5>
      <ul className="va-lines">
        {lines.map((l) => (
          <li key={l.id} className="va-line" data-tier={l.tier ?? "none"}>
            <span aria-hidden="true">{l.glyph}</span> {l.tier ? <strong>{l.tier}</strong> : null} {l.text}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function AttentionPanel({ items, overlays, plan, asOf, feed, feedAsOf, reachedIds }: Props) {
  const pinned = useAttentionStore((s) => s.pinned);
  const muted = useAttentionStore((s) => s.muted);
  const togglePin = useAttentionStore((s) => s.togglePin);
  const toggleMute = useAttentionStore((s) => s.toggleMute);
  const reset = useAttentionStore((s) => s.reset);
  const ranked = useMemo(() => rankAttention(items, { asOf, plan, overlays, overrides: { pinned, muted } }), [items, asOf, plan, overlays, pinned, muted]);
  const c = useMemo(() => compress(ranked.entries, { asOf, ...(feed ? { feed } : {}), ...(feedAsOf !== undefined ? { feedAsOf } : {}), ...(reachedIds ? { reachedIds } : {}) }), [ranked, asOf, feed, feedAsOf, reachedIds]);
  const overridden = pinned.length + muted.length > 0;

  return (
    <section className="vc-panel va-root" aria-label="Attention and decision summary">
      <h4>Attention <span className="dk-sample">sample</span></h4>
      <Answer title="What matters" lines={c.matters} />
      <Answer title="Watch next" lines={c.watchNext} />
      <Answer title="What changes" lines={c.changes} />
      <h5>Ranked attention ({ranked.entries.length})</h5>
      {ranked.entries.length === 0 ? <p className="dk-muted">Nothing knowable at this time.</p> : (
        <ol className="va-list" aria-label="Ranked attention">
          {ranked.entries.map((e) => (
            <li key={e.item.id} className="va-item" data-tier={e.tier} data-pinned={e.pinned} data-muted={e.muted}>
              <span className="va-rank">{e.rank}.</span>
              <span className="va-text"><strong>{e.tier}</strong> {e.item.engine} · {e.item.label}
                <span className="vc-source-state"> · {e.reason}{e.pinned ? " · ⚑ pinned" : ""}{e.muted ? " · ⊘ muted (still listed)" : ""}</span>
              </span>
              <button type="button" className="va-btn" aria-pressed={e.pinned} aria-label={`Pin ${e.item.label}`} onClick={() => togglePin(e.item.id)}>⚑ Pin</button>
              <button type="button" className="va-btn" aria-pressed={e.muted} aria-label={`Mute ${e.item.label}`} disabled={e.tier === "P0"}
                title={e.tier === "P0" ? "P0 cannot be muted" : undefined} onClick={() => toggleMute(e.item.id)}>⊘ Mute</button>
            </li>
          ))}
        </ol>
      )}
      <div className="va-actions">
        <button type="button" className="va-btn" onClick={reset} disabled={!overridden}>Reset attention overrides</button>
      </div>
      <p className="dk-muted">Pin / mute change order only — nothing is hidden and P0 is never muted.</p>
    </section>
  );
}