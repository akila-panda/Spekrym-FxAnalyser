/** DESK DK6 — immutable Prepare snapshots. A snapshot freezes what was accepted/rejected, the notes, rulesVersion,
 *  as-of and sample/live at the moment it is taken. There is no update or delete — only add (and clearAll for the
 *  data-clear control). Local only (spekrym.desk.snapshots.v1), never replicated. */
import { create } from "zustand";
import { canonicalHash } from "@/desk/lib/hash";
import { createLocalStore } from "@/desk/lib/storage";
import { viewAsOf } from "@/desk/kernel/viewAsOf";
import { SnapshotSchema, type AnalysisObject, type Decision, type Snapshot } from "@/desk/types/schemas";

export const MAX_SNAPSHOTS = 100;

export function deepFreeze<T>(v: T): T {
  if (v && typeof v === "object" && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const k of Object.keys(v as object)) deepFreeze((v as Record<string, unknown>)[k]);
  }
  return v;
}

export interface SnapshotInput {
  pair: Snapshot["pair"]; date: string; as_of: number; dataKind: Snapshot["dataKind"]; rulesVersion: string;
  /** Every object the trader saw (detected + custom). Only accepted ones are kept in full. */
  objects: readonly AnalysisObject[];
  decisions: ReadonlyMap<string, Decision>;
  reviewedSteps: readonly string[];
  notes: string;
  created_at: number;
}

/** Pure. Nothing with known_at after `as_of` can enter the snapshot (same viewAsOf path as the chart). */
export function buildSnapshot(i: SnapshotInput): Snapshot {
  const known = viewAsOf(i.objects, i.as_of);
  const ids = (pred: (a: Decision["action"]) => boolean) =>
    known.filter((o) => { const d = i.decisions.get(o.id); return !!d && pred(d.action); }).map((o) => o.id);
  const acceptedIds = ids((a) => a === "accept" || a === "custom");
  const rejectedIds = ids((a) => a === "reject");
  const revisitIds = ids((a) => a === "revisit");
  const accepted = new Set(acceptedIds);
  const notes = i.notes.trim();
  const id = `snap:${i.pair}:${i.date}:${canonicalHash([i.as_of, acceptedIds, rejectedIds, revisitIds, notes, i.created_at])}`;
  return SnapshotSchema.parse({
    id, pair: i.pair, date: i.date, as_of: i.as_of, dataKind: i.dataKind, rulesVersion: i.rulesVersion,
    acceptedIds, rejectedIds, revisitIds, reviewedSteps: [...i.reviewedSteps],
    objects: known.filter((o) => accepted.has(o.id)), ...(notes ? { notes } : {}), created_at: i.created_at,
  });
}

const parseSnapshots = (raw: unknown): Snapshot[] =>
  (Array.isArray(raw) ? raw : []).flatMap((r) => { const p = SnapshotSchema.safeParse(r); return p.success ? [p.data] : []; }).slice(-MAX_SNAPSHOTS);

const store = createLocalStore<Snapshot[]>({ name: "snapshots", version: 1, parse: parseSnapshots, empty: () => [], maxBytes: 4_194_304 });

interface SnapshotState {
  snapshots: readonly Snapshot[];
  /** Adds a frozen copy. Returns false for an invalid snapshot or a duplicate id. */
  add: (s: Snapshot) => boolean;
  clearAll: () => void;
}

export const useSnapshotStore = create<SnapshotState>()((set, get) => ({
  snapshots: store.load().map(deepFreeze),
  add: (s) => {
    const p = SnapshotSchema.safeParse(s);
    if (!p.success || get().snapshots.some((x) => x.id === p.data.id)) return false;
    set((st) => ({ snapshots: [...st.snapshots, deepFreeze(structuredClone(p.data))].slice(-MAX_SNAPSHOTS) }));
    return true;
  },
  clearAll: () => set({ snapshots: [] }),
}));

useSnapshotStore.subscribe((s, p) => {
  if (s.snapshots === p.snapshots) return;
  if (!store.save(s.snapshots as Snapshot[])) store.save(s.snapshots.slice(Math.floor(s.snapshots.length / 4)) as Snapshot[]);
});

export const snapshotsForDay = (all: readonly Snapshot[], pair: string, date: string): Snapshot[] =>
  all.filter((s) => s.pair === pair && s.date === date);