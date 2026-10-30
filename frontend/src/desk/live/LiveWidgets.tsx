/** DESK DK14 — Live widgets: Market Change Feed (with thesis-vs-changes) and Readiness chain.
 *  Every control is a real labelled button; the feed list is `aria-live="polite"`; status uses glyph + text, never colour alone. */
import { useState } from "react";
import { fmtTime } from "@/desk/evidence/describe";
import { useDeskUiStore } from "@/desk/workspace/deskUiStore";
import { useLiveStore } from "./liveStore";
import { feedTime, type FeedEvent } from "./changeFeed";
import { showObject, useLive } from "./useLive";
import type { StepStatus } from "./readiness";

const STEP_GLYPH: Record<StepStatus, string> = { seen: "✓", pending: "○", failed: "✕", unavailable: "–" };

function Row({ e, open }: { e: FeedEvent; open: (id: string) => void }) {
  const mark = useLiveStore((s) => s.marks[e.id]);
  const { acknowledge, dismiss, setNote } = useLiveStore.getState();
  const [editing, setEditing] = useState(false);
  return (
    <li className="dk-feed-row" data-ack={mark?.ack ? "true" : "false"}>
      <button type="button" className="dk-conf-row" onClick={() => open(e.objectId)} aria-label={`Show evidence: ${e.text}`}>
        <time dateTime={new Date(e.t * 1000).toISOString()}>{feedTime(e)}</time>
        <span>{e.text}{e.where ? ` · ${e.where}` : ""}{e.thesis ? " · thesis object" : ""}{mark?.ack ? " · acknowledged ✓" : ""}</span>
      </button>
      <span className="dk-actions">
        <button type="button" disabled={!!mark?.ack} onClick={() => acknowledge(e.id)} aria-label={`Acknowledge: ${e.text}`}>Acknowledge</button>
        <button type="button" onClick={() => dismiss(e.id)} aria-label={`Dismiss: ${e.text}`}>Dismiss</button>
        <button type="button" aria-expanded={editing} onClick={() => setEditing(!editing)} aria-label={`Note: ${e.text}`}>Note</button>
      </span>
      {mark?.note && !editing && <p className="dk-muted">Note: {mark.note}</p>}
      {editing && (
        <input aria-label={`Note text: ${e.text}`} defaultValue={mark?.note ?? ""} maxLength={500}
          onBlur={(ev) => { setNote(e.id, ev.target.value); setEditing(false); }}
          onKeyDown={(ev) => { if (ev.key === "Enter") { setNote(e.id, (ev.target as HTMLInputElement).value); setEditing(false); } }} />
      )}
    </li>
  );
}

export function ChangeFeedBody() {
  const live = useLive();
  const marks = useLiveStore((s) => s.marks);
  const select = useDeskUiStore((s) => s.select);
  const [showDismissed, setShowDismissed] = useState(false);
  if (!live) return <p className="dk-muted" aria-busy="true">Loading feed…</p>;
  const open = (id: string) => { showObject(live.objects, id, live.dataKind); select(id); };
  const hidden = live.events.filter((e) => marks[e.id]?.dismissed);
  const shown = live.events.filter((e) => showDismissed || !marks[e.id]?.dismissed);
  const t = live.thesis;
  return (
    <div className="dk-feed">
      <section className="dk-thesis" aria-label="Thesis and changes since">
        <h4>Original thesis <span className="dk-sample">{t.dataKind ?? live.dataKind}</span></h4>
        {!t.saved ? <p className="dk-muted">No thesis saved for today — accept levels in Prepare and save a snapshot.</p> : (
          <>
            <p className="dk-muted">Saved at {fmtTime(t.savedAt as number)} · unchanged</p>
            {t.lines.length ? <ul>{t.lines.map((l, i) => <li key={i}>{l}</li>)}</ul> : <p className="dk-muted">No accepted objects.</p>}
            {t.notes && <p>{t.notes}</p>}
            <h4>Changed since ({t.since.length})</h4>
            {t.since.length === 0 ? <p className="dk-muted">Nothing meaningful since the snapshot.</p> : <ul>{t.since.slice(0, 5).map((e) => <li key={e.id}>{feedTime(e)} · {e.text}</li>)}</ul>}
          </>
        )}
      </section>
      <h4>Market Change Feed (last 24 h)</h4>
      {shown.length === 0
        ? <p className="dk-muted">No meaningful changes near price — widen the window or wait for new bars.</p>
        : <ul className="dk-feed-list" aria-live="polite" aria-label="Market Change Feed">{shown.map((e) => <Row key={e.id} e={e} open={open} />)}</ul>}
      {hidden.length > 0 && (
        <button type="button" aria-pressed={showDismissed} onClick={() => setShowDismissed(!showDismissed)}>
          {showDismissed ? "Hide" : "Show"} dismissed ({hidden.length})
        </button>
      )}
    </div>
  );
}

export function ReadinessBody() {
  const live = useLive();
  const select = useDeskUiStore((s) => s.select);
  if (!live) return <p className="dk-muted" aria-busy="true">Loading readiness…</p>;
  const r = live.readiness;
  const open = (id: string) => { showObject(live.objects, id, live.dataKind); select(id); };
  return (
    <div className="dk-ready">
      <p className="dk-muted"><span className="dk-sample">{live.dataKind}</span> {r.complete ? "All configured steps seen — ready to review." : "Steps are descriptive facts, not a forecast."}</p>
      <ol aria-label="Readiness chain">
        {r.steps.map((s) => (
          <li key={s.id}>
            <span aria-hidden="true">{STEP_GLYPH[s.status]}</span> <strong>{s.label}</strong> — {s.status}{s.t ? ` @ ${fmtTime(s.t)}` : ""}
            {s.missing && <span className="dk-muted"> · {s.missing}</span>}
            {s.objectId && <button type="button" className="dk-conf-row" aria-label={`Show evidence: ${s.label}`} onClick={() => open(s.objectId as string)}>Show evidence</button>}
          </li>
        ))}
      </ol>
    </div>
  );
}