/** DESK DK6 — Prepare worksheet state. Persisted slice: per pair+day drafts (checklist marks, custom levels, notes) at
 *  spekrym.desk.prepare.v1 (local only, never replicated). Ephemeral: current step/cursor, undo stack, published view. */
import { create } from "zustand";
import { createLocalStore } from "@/desk/lib/storage";
import type { Decision } from "@/desk/types/schemas";
import type { Pair, Timeframe } from "@/types/market";
import type { ChecklistItem } from "./checklist";
import { STEPS, type InboxItem, type Step } from "./walk";

export interface CustomLevel {
  id: string; pair: Pair; tf: Timeframe; price: number; label: string; group: string; notes: string;
  /** As-of the trader created it (UTC s) — a custom level is knowable from then on. */
  known_at: number; seq: number;
}
export interface Draft { reviewed: Partial<Record<Step, boolean>>; customs: CustomLevel[]; notes: string }
export const emptyDraft = (): Draft => ({ reviewed: {}, customs: [], notes: "" });
export const draftKey = (pair: string, date: string): string => `${pair}|${date}`;
export const NOTES_MAX = 2000;

const isStep = (v: string): v is Step => (STEPS as readonly string[]).includes(v);

export function parseDrafts(raw: unknown): Record<string, Draft> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, Draft> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== "object") continue;
    const d = v as Partial<Draft>;
    const reviewed: Draft["reviewed"] = {};
    for (const [s, b] of Object.entries(d.reviewed ?? {})) if (isStep(s) && typeof b === "boolean") reviewed[s] = b;
    const customs = (Array.isArray(d.customs) ? d.customs : []).filter((c): c is CustomLevel =>
      !!c && typeof c.id === "string" && typeof c.price === "number" && Number.isFinite(c.price) && isStep(String(c.tf)) &&
      typeof c.label === "string" && Number.isInteger(c.known_at));
    out[k] = { reviewed, customs, notes: typeof d.notes === "string" ? d.notes.slice(0, NOTES_MAX) : "" };
  }
  return out;
}

const store = createLocalStore<Record<string, Draft>>({ name: "prepare", version: 1, parse: parseDrafts, empty: () => ({}) });

export interface UndoEntry { pair: string; date: string; objectId: string; prev: Decision | null; custom: boolean }

export interface PrepareView {
  pair: Pair; date: string; asOf: number; rulesVersion: string; dataKind: "sample" | "live";
  inbox: Record<Step, InboxItem[]>;
  checklist: ChecklistItem[];
}

interface PrepareState {
  drafts: Record<string, Draft>;
  step: Step;
  cursor: number;
  undo: UndoEntry[];
  view: PrepareView | null;
  setStep: (s: Step) => void;
  setCursor: (i: number) => void;
  setView: (v: PrepareView | null) => void;
  patchDraft: (key: string, fn: (d: Draft) => Draft) => void;
  pushUndo: (u: UndoEntry) => void;
  popUndo: () => UndoEntry | null;
}

export const usePrepareStore = create<PrepareState>()((set, get) => ({
  drafts: store.load(),
  step: "W",
  cursor: 0,
  undo: [],
  view: null,
  setStep: (step) => set({ step, cursor: 0 }),
  setCursor: (cursor) => set({ cursor }),
  setView: (view) => set({ view }),
  patchDraft: (key, fn) => set((s) => ({ drafts: { ...s.drafts, [key]: fn(s.drafts[key] ?? emptyDraft()) } })),
  pushUndo: (u) => set((s) => ({ undo: [...s.undo, u].slice(-50) })),
  popUndo: () => {
    const u = get().undo;
    if (u.length === 0) return null;
    set({ undo: u.slice(0, -1) });
    return u[u.length - 1] as UndoEntry;
  },
}));

usePrepareStore.subscribe((s, p) => { if (s.drafts !== p.drafts) store.save(s.drafts); });