/** F20 — the trader's attention overrides (pin / mute). Local only, never replicated; presentation only —
 *  never read by detection or by P0 handling. Key: spekrym.desk.attention.v1. */
import { create } from "zustand";
import { createLocalStore } from "@/desk/lib/storage";

export interface AttentionPrefs { pinned: string[]; muted: string[] }
const strs = (x: unknown): string[] => (Array.isArray(x) ? [...new Set(x.filter((v): v is string => typeof v === "string"))] : []);
export function parseAttention(raw: unknown): AttentionPrefs {
  const r = raw as Partial<AttentionPrefs> | null;
  const pinned = strs(r?.pinned);
  return { pinned, muted: strs(r?.muted).filter((id) => !pinned.includes(id)) };
}

const store = createLocalStore<AttentionPrefs>({ name: "attention", version: 1, parse: parseAttention, empty: () => ({ pinned: [], muted: [] }) });

interface AttentionState extends AttentionPrefs {
  togglePin: (id: string) => void;
  toggleMute: (id: string) => void;
  reset: () => void;
}
export const useAttentionStore = create<AttentionState>()((set) => ({
  ...store.load(),
  togglePin: (id) => set((s) => (s.pinned.includes(id)
    ? { pinned: s.pinned.filter((x) => x !== id) }
    : { pinned: [...s.pinned, id], muted: s.muted.filter((x) => x !== id) })),
  toggleMute: (id) => set((s) => (s.muted.includes(id)
    ? { muted: s.muted.filter((x) => x !== id) }
    : { muted: [...s.muted, id], pinned: s.pinned.filter((x) => x !== id) })),
  reset: () => set({ pinned: [], muted: [] }),
}));
useAttentionStore.subscribe((s) => store.save({ pinned: s.pinned, muted: s.muted }));