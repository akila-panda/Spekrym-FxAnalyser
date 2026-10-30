/** DESK DK16 — journal: immutable decision records + separately-attached outcomes. Entries have no update/delete
 *  (only add, and clearAll for the data-clear control); outcomes can be set/replaced, never altering the entry.
 *  Local only (spekrym.desk.journal.v1), never replicated. */
import { create } from "zustand";
import { createLocalStore } from "@/desk/lib/storage";
import { deepFreeze } from "@/desk/prepare/snapshotStore";
import { JournalEntrySchema, OutcomeSchema, type JournalEntry, type Outcome } from "./types";

export const MAX_ENTRIES = 300;
interface Persisted { entries: JournalEntry[]; outcomes: Record<string, Outcome> }

export function parseJournal(raw: unknown): Persisted {
  const o = (raw && typeof raw === "object" ? raw : {}) as { entries?: unknown; outcomes?: unknown };
  const entries = (Array.isArray(o.entries) ? o.entries : []).flatMap((r) => { const p = JournalEntrySchema.safeParse(r); return p.success ? [p.data] : []; }).slice(-MAX_ENTRIES);
  const ids = new Set(entries.map((e) => e.id));
  const outcomes: Record<string, Outcome> = {};
  if (o.outcomes && typeof o.outcomes === "object" && !Array.isArray(o.outcomes)) {
    for (const [id, v] of Object.entries(o.outcomes as Record<string, unknown>)) { const p = OutcomeSchema.safeParse(v); if (p.success && ids.has(id)) outcomes[id] = p.data; }
  }
  return { entries, outcomes };
}

const store = createLocalStore<Persisted>({ name: "journal", version: 1, parse: parseJournal, empty: () => ({ entries: [], outcomes: {} }), maxBytes: 4_194_304 });
const initial = store.load();

interface JournalState {
  entries: readonly JournalEntry[];
  outcomes: Readonly<Record<string, Outcome>>;
  /** Adds a frozen copy. False for an invalid entry or a duplicate id. */
  add: (e: JournalEntry) => boolean;
  setOutcome: (id: string, o: Outcome) => boolean;
  clearOutcome: (id: string) => void;
  clearAll: () => void;
}

export const useJournalStore = create<JournalState>()((set, get) => ({
  entries: initial.entries.map(deepFreeze),
  outcomes: initial.outcomes,
  add: (e) => {
    const p = JournalEntrySchema.safeParse(e);
    if (!p.success || get().entries.some((x) => x.id === p.data.id)) return false;
    set((s) => ({ entries: [...s.entries, deepFreeze(structuredClone(p.data))].slice(-MAX_ENTRIES) }));
    return true;
  },
  setOutcome: (id, o) => {
    const p = OutcomeSchema.safeParse(o);
    if (!p.success || !get().entries.some((x) => x.id === id)) return false;
    set((s) => ({ outcomes: { ...s.outcomes, [id]: p.data } }));
    return true;
  },
  clearOutcome: (id) => set((s) => { const { [id]: _drop, ...rest } = s.outcomes; return { outcomes: rest }; }),
  clearAll: () => set({ entries: [], outcomes: {} }),
}));

useJournalStore.subscribe((s, p) => {
  if (s.entries === p.entries && s.outcomes === p.outcomes) return;
  const all: Persisted = { entries: s.entries as JournalEntry[], outcomes: s.outcomes as Record<string, Outcome> };
  if (!store.save(all)) store.save({ entries: all.entries.slice(Math.floor(all.entries.length / 4)), outcomes: all.outcomes });
});