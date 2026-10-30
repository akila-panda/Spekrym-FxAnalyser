/** DESK DK6 — Prepare widgets: Top-down checklist (left dock), Levels inbox (right dock), and the worksheet stage
 *  (step rail · current candidate · custom level · notes · snapshot). Every control is a real, labelled button. */
import { isDemo } from "@/desk/demo/flag";
import { PrepareChart } from "@/desk/demo/PrepareChart";
import { useState } from "react";
import { describeObject, DEPTH_FOR } from "@/desk/evidence/describe";
import { decisionsForDay, useDecisionStore } from "@/desk/decisions/decisionStore";
import { ExportPanel } from "@/desk/export/ExportPanel";
import { useDeskStore } from "@/desk/workspace/deskStore";
import { PAIR_META, type Timeframe } from "@/types/market";
import { addCustom, cursorBy, goCursor, goStep, markReviewed, removeCustom, saveSnapshot, setNotes, triage, undo } from "./actions";
import { CUSTOM_GROUPS } from "./customLevel";
import { draftKey, emptyDraft, usePrepareStore } from "./prepareStore";
import { snapshotsForDay, useSnapshotStore } from "./snapshotStore";
import { STEPS, type Triage } from "./walk";

const GLYPH: Record<NonNullable<Triage> | "none", string> = { accept: "✓", reject: "✗", revisit: "?", custom: "＋", none: "○" };
const WORD: Record<NonNullable<Triage> | "none", string> = { accept: "accepted", reject: "rejected", revisit: "revisit", custom: "custom", none: "to triage" };
const glyph = (t: Triage) => GLYPH[t ?? "none"];
const word = (t: Triage) => WORD[t ?? "none"];

const Skeleton = () => <p className="dk-muted" aria-busy="true">Loading worksheet…</p>;

export function ChecklistBody() {
  const view = usePrepareStore((s) => s.view);
  if (!view) return <Skeleton />;
  return (
    <ul className="dk-checklist" aria-label="Top-down checklist">
      {view.checklist.map((c) => (
        <li key={c.step}>
          <label className="dk-check">
            <input type="checkbox" checked={c.done} onChange={(e) => markReviewed(c.step, e.target.checked)} />
            <span>{c.step} reviewed</span>
          </label>
          <span className="dk-muted"> {c.triaged}/{c.total} triaged · {c.override === undefined ? "auto" : "manual"}</span>
        </li>
      ))}
    </ul>
  );
}

export function InboxBody() {
  const view = usePrepareStore((s) => s.view);
  const step = usePrepareStore((s) => s.step);
  const cursor = usePrepareStore((s) => s.cursor);
  const complexity = useDeskStore((s) => s.complexity);
  if (!view) return <Skeleton />;
  const items = view.inbox[step];
  if (items.length === 0) return <p className="dk-muted">No levels proposed on {step} — widen lookback or lower min significance, or add a custom level.</p>;
  return (
    <ul className="dk-inbox" aria-label={`${step} candidates`}>
      {items.map((it, i) => (
        <li key={it.object.id}>
          <button type="button" className="dk-inbox-row" aria-current={i === cursor} onClick={() => goCursor(i)}
            aria-label={`${describeObject(it.object, "headline", { viewTf: step }).headline}, ${word(it.triage)}`}>
            <span aria-hidden="true" className="dk-glyph">{glyph(it.triage)}</span>
            <span>{describeObject(it.object, DEPTH_FOR[complexity] === "headline" ? "headline" : "headline", { viewTf: step }).headline}</span>
            <span className="dk-muted"> {word(it.triage)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function CustomForm() {
  const view = usePrepareStore((s) => s.view);
  const step = usePrepareStore((s) => s.step);
  const [price, setPrice] = useState("");
  const [label, setLabel] = useState("");
  const [group, setGroup] = useState<string>(CUSTOM_GROUPS[0]);
  const [notes, setNotesText] = useState("");
  const [err, setErr] = useState("");
  if (!view) return null;
  const decimals = PAIR_META[view.pair].decimals;
  const submit = () => {
    const ok = addCustom({ tf: step as Timeframe, price: Number(price), label, group, notes });
    setErr(ok ? "" : "Enter a price above 0.");
    if (ok) { setPrice(""); setLabel(""); setNotesText(""); }
  };
  return (
    <fieldset className="dk-custom">
      <legend>Add custom level on {step}</legend>
      <label className="dk-field">Price <input type="number" step={10 ** -decimals} value={price} onChange={(e) => setPrice(e.target.value)} /></label>
      <label className="dk-field">Label <input type="text" maxLength={40} value={label} onChange={(e) => setLabel(e.target.value)} /></label>
      <label className="dk-field">Group <select value={group} onChange={(e) => setGroup(e.target.value)}>{CUSTOM_GROUPS.map((g) => <option key={g}>{g}</option>)}</select></label>
      <label className="dk-field">Level notes <input type="text" maxLength={200} value={notes} onChange={(e) => setNotesText(e.target.value)} /></label>
      <button type="button" onClick={submit}>Add level</button>
      {err && <span role="alert" className="dk-pin">⚠ {err}</span>}
    </fieldset>
  );
}

export function PrepareStage() {
  const view = usePrepareStore((s) => s.view);
  const step = usePrepareStore((s) => s.step);
  const cursor = usePrepareStore((s) => s.cursor);
  const drafts = usePrepareStore((s) => s.drafts);
  const undoCount = usePrepareStore((s) => s.undo.length);
  const complexity = useDeskStore((s) => s.complexity);
  const decisions = useDecisionStore((s) => s.decisions);
  const snaps = useSnapshotStore((s) => s.snapshots);
  const [saved, setSaved] = useState<string | null>(null);
  if (!view) return <main className="dk-stage dk-prepare" aria-label="Prepare worksheet"><Skeleton /></main>;
  const items = view.inbox[step];
  const item = items[cursor];
  const draft = drafts[draftKey(view.pair, view.date)] ?? emptyDraft();
  const day = decisionsForDay(decisions, view.pair, view.date);
  const desc = item ? describeObject(item.object, DEPTH_FOR[complexity], { viewTf: step as Timeframe }) : null;
  const mine = snapshotsForDay(snaps, view.pair, view.date);
  return (
    <main className="dk-stage dk-prepare" aria-label="Prepare worksheet">
      <div className="dk-rail" role="group" aria-label="Top-down step">
        {STEPS.map((s) => {
          const c = view.checklist.find((x) => x.step === s)!;
          return (
            <button key={s} type="button" aria-pressed={s === step} onClick={() => goStep(s)}
              aria-label={`${s} step, ${c.triaged} of ${c.total} triaged${c.done ? ", reviewed" : ""}`}>
              {s} <span aria-hidden="true">{c.done ? "✓" : `${c.triaged}/${c.total}`}</span>
            </button>
          );
        })}
      </div>
      <p className="dk-muted"><span className="dk-sample">{view.dataKind}</span> {view.pair.replace("_", "/")} · as of {new Date(view.asOf * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC · rules {view.rulesVersion}</p>

      {isDemo() && <PrepareChart view={view} step={step} cursor={cursor} />}

      <section className="dk-card" aria-label="Current candidate">
        {desc && item ? (
          <>
            <p><strong>{desc.headline}</strong> <span className="dk-muted">{glyph(item.triage)} {word(item.triage)} · {cursor + 1} of {items.length}</span></p>
            {desc.explanation.length > 0 && <ul>{desc.explanation.map((l, i) => <li key={i}>{l}</li>)}</ul>}
            <div className="dk-actions">
              <button type="button" onClick={() => cursorBy(-1)} aria-keyshortcuts="K">Previous (K)</button>
              <button type="button" onClick={() => cursorBy(1)} aria-keyshortcuts="J">Next (J)</button>
              <button type="button" onClick={() => triage("accept")} aria-keyshortcuts="Y">✓ Accept (Y)</button>
              <button type="button" onClick={() => triage("reject")} aria-keyshortcuts="N">✗ Reject (N)</button>
              <button type="button" onClick={() => triage("revisit")} aria-keyshortcuts="R">? Revisit (R)</button>
              {item.custom && <button type="button" onClick={() => removeCustom(item.object.id)}>Remove custom level</button>}
              <button type="button" onClick={undo} disabled={undoCount === 0} aria-keyshortcuts="U">↶ Undo (U)</button>
            </div>
          </>
        ) : <p className="dk-muted">No candidates on {step}. Add a custom level or step on with ].</p>}
      </section>

      <CustomForm />

      <section className="dk-card" aria-label="Worksheet notes and snapshot">
        <label className="dk-field dk-notes">Worksheet notes
          <textarea rows={3} maxLength={2000} value={draft.notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <div className="dk-actions">
          <button type="button" onClick={() => setSaved(saveSnapshot() ?? "exists")}>Save snapshot</button>
          <span className="dk-muted" role="status">
            {saved === null ? `${[...day.values()].filter((d) => d.action === "accept" || d.action === "custom").length} accepted` : saved === "exists" ? "Nothing new to snapshot." : "Snapshot saved (immutable)."}
          </span>
        </div>
        {mine.length > 0 && (
          <ul aria-label="Saved snapshots" className="dk-snaps">
            {mine.map((s) => <li key={s.id}><span className="dk-sample">{s.dataKind}</span> {s.acceptedIds.length} accepted · {s.rejectedIds.length} rejected · {s.revisitIds.length} revisit · {s.reviewedSteps.length}/7 steps · {s.rulesVersion}</li>)}
          </ul>
        )}
      </section>

      <ExportPanel />
    </main>
  );
}