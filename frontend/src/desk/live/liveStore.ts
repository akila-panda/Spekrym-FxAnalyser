/** DESK DK14 — Change Feed triage state (acknowledge / dismiss / note per event id). Own store, local only, never replicated.
 *  Persisted at spekrym.desk.live.v1 (quota-guarded: oldest entries dropped first). */
import { create } from "zustand";
import { createLocalStore } from "@/desk/lib/storage";

export interface FeedMark { ack?: boolean; dismissed?: boolean; note?: string }
export const MAX_MARKS = 500;

export function parseMarks(raw: unknown): Record<string, FeedMark> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, FeedMark> = {};
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== "object") continue;
    const m = v as Record<string, unknown>;
    out[id] = {
      ...(m.ack === true ? { ack: true } : {}), ...(m.dismissed === true ? { dismissed: true } : {}),
      ...(typeof m.note === "string" && m.note ? { note: m.note.slice(0, 500) } : {}),
    };
  }
  return Object.fromEntries(Object.entries(out).slice(-MAX_MARKS));
}

const store = createLocalStore<Record<string, FeedMark>>({ name: "live", version: 1, parse: parseMarks, empty: () => ({}) });

interface LiveState {
  marks: Record<string, FeedMark>;
  acknowledge: (id: string) => void;
  dismiss: (id: string) => void;
  restore: (id: string) => void;
  setNote: (id: string, note: string) => void;
  clear: () => void;
}
const put = (m: Record<string, FeedMark>, id: string, v: FeedMark): Record<string, FeedMark> => {
  const { [id]: _drop, ...rest } = m;
  return Object.fromEntries(Object.entries({ ...rest, [id]: v }).slice(-MAX_MARKS));
};

export const useLiveStore = create<LiveState>()((set) => ({
  marks: store.load(),
  acknowledge: (id) => set((s) => ({ marks: put(s.marks, id, { ...s.marks[id], ack: true }) })),
  dismiss: (id) => set((s) => ({ marks: put(s.marks, id, { ...s.marks[id], dismissed: true }) })),
  restore: (id) => set((s) => ({ marks: put(s.marks, id, { ...s.marks[id], dismissed: false }) })),
  setNote: (id, note) => set((s) => ({ marks: put(s.marks, id, { ...s.marks[id], note: note.trim().slice(0, 500) }) })),
  clear: () => set({ marks: {} }),
}));

useLiveStore.subscribe((s, p) => {
  if (s.marks === p.marks) return;
  if (!store.save(s.marks)) store.save(Object.fromEntries(Object.entries(s.marks).slice(Math.floor(Object.keys(s.marks).length / 4))));
});