/** DESK DK6 — Prepare actions (triage, undo, step/cursor, custom levels, checklist marks, snapshot). Plain functions over
 *  the stores so keys, buttons and tests share one path. Never writes viewStore.asOf. */
import { useDecisionStore, decisionsForDay } from "@/desk/decisions/decisionStore";
import { useDeskUiStore } from "@/desk/workspace/deskUiStore";
import { PAIR_META, type Timeframe } from "@/types/market";
import { reviewedSteps } from "./checklist";
import { customId } from "./customLevel";
import { draftKey, NOTES_MAX, emptyDraft, usePrepareStore, type CustomLevel } from "./prepareStore";
import { buildSnapshot, useSnapshotStore } from "./snapshotStore";
import { moveStep, STEPS, type Step } from "./walk";

const ps = () => usePrepareStore.getState();

function select(): void {
  const { view, step, cursor } = ps();
  useDeskUiStore.getState().select(view?.inbox[step][cursor]?.object.id ?? null);
}

export function goStep(step: Step): void { ps().setStep(step); select(); }
export const stepBy = (delta: number): void => goStep(moveStep(ps().step, delta));

export function goCursor(i: number): void {
  const n = ps().view?.inbox[ps().step].length ?? 0;
  if (n === 0) return;
  ps().setCursor(Math.min(n - 1, Math.max(0, i)));
  select();
}
export const cursorBy = (delta: number): void => goCursor(ps().cursor + delta);

export function triage(action: "accept" | "reject" | "revisit"): void {
  const { view, step, cursor } = ps();
  const item = view?.inbox[step][cursor];
  if (!view || !item) return;
  const prev = useDecisionStore.getState().decide({
    pair: view.pair, date: view.date, objectId: item.object.id, action,
    rulesVersion: view.rulesVersion, decided_at: Math.floor(Date.now() / 1000),
  });
  ps().pushUndo({ pair: view.pair, date: view.date, objectId: item.object.id, prev, custom: false });
  // Advance to the next candidate (the view republishes with the new triage state).
  const n = view.inbox[step].length;
  ps().setCursor(Math.min(n - 1, cursor + 1));
  select();
}

export function undo(): void {
  const u = ps().popUndo();
  if (!u) return;
  useDecisionStore.getState().restore(u.pair, u.date, u.objectId, u.prev);
  if (u.custom) {
    const key = draftKey(u.pair, u.date);
    ps().patchDraft(key, (d) => ({ ...d, customs: d.customs.filter((c) => c.id !== u.objectId) }));
  }
  const view = ps().view;
  if (view) {
    for (const s of STEPS) {
      const i = view.inbox[s].findIndex((x) => x.object.id === u.objectId);
      if (i >= 0) { ps().setStep(s); ps().setCursor(i); break; }
    }
  }
  select();
}

export interface CustomInput { tf: Timeframe; price: number; label: string; group: string; notes: string }

/** Adds a custom level at the current as-of and records it as a "custom" decision. Returns false on invalid input. */
export function addCustom(input: CustomInput): boolean {
  const { view } = ps();
  if (!view || !Number.isFinite(input.price) || input.price <= 0) return false;
  const key = draftKey(view.pair, view.date);
  const draft = ps().drafts[key] ?? emptyDraft();
  const seq = draft.customs.reduce((m, c) => Math.max(m, c.seq), 0) + 1;
  const base = { pair: view.pair, tf: input.tf, known_at: view.asOf, seq };
  const c: CustomLevel = {
    ...base, id: customId(base),
    price: Number(input.price.toFixed(PAIR_META[view.pair].decimals)),
    label: input.label.trim().slice(0, 40) || "Custom level",
    group: input.group.trim().slice(0, 20) || "Level",
    notes: input.notes.trim().slice(0, 200),
  };
  ps().patchDraft(key, (d) => ({ ...d, customs: [...d.customs, c] }));
  const prev = useDecisionStore.getState().decide({
    pair: view.pair, date: view.date, objectId: c.id, action: "custom",
    rulesVersion: view.rulesVersion, decided_at: Math.floor(Date.now() / 1000),
  });
  ps().pushUndo({ pair: view.pair, date: view.date, objectId: c.id, prev, custom: true });
  return true;
}

export function removeCustom(id: string): void {
  const { view } = ps();
  if (!view) return;
  ps().patchDraft(draftKey(view.pair, view.date), (d) => ({ ...d, customs: d.customs.filter((c) => c.id !== id) }));
  useDecisionStore.getState().restore(view.pair, view.date, id, null);
}

/** Checkbox on the checklist: an explicit mark that overrides auto. */
export function markReviewed(step: Step, reviewed: boolean): void {
  const { view } = ps();
  if (!view) return;
  ps().patchDraft(draftKey(view.pair, view.date), (d) => ({ ...d, reviewed: { ...d.reviewed, [step]: reviewed } }));
}

export function setNotes(text: string): void {
  const { view } = ps();
  if (!view) return;
  ps().patchDraft(draftKey(view.pair, view.date), (d) => ({ ...d, notes: text.slice(0, NOTES_MAX) }));
}

/** Freezes the worksheet into an immutable snapshot. Returns its id, or null when there is nothing to snapshot / it exists. */
export function saveSnapshot(): string | null {
  const { view, drafts } = ps();
  if (!view) return null;
  const draft = drafts[draftKey(view.pair, view.date)] ?? emptyDraft();
  const seen = STEPS.flatMap((s) => view.inbox[s].map((i) => i.object));
  const snap = buildSnapshot({
    pair: view.pair, date: view.date, as_of: view.asOf, dataKind: view.dataKind, rulesVersion: view.rulesVersion,
    objects: seen, decisions: decisionsForDay(useDecisionStore.getState().decisions, view.pair, view.date),
    reviewedSteps: reviewedSteps(view.checklist), notes: draft.notes, created_at: Math.floor(Date.now() / 1000),
  });
  return useSnapshotStore.getState().add(snap) ? snap.id : null;
}