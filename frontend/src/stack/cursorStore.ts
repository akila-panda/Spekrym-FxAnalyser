/** S5/W5: the shared crosshair time. Local hovers carry a `source` row; a cursor mirrored from another window has `source: null` and is drawn on every row. */
import { create, type StateCreator } from "zustand";
import type { Timeframe } from "@/types/market";

export interface CursorState {
  /** Hovered bar time (UTC seconds), or null when nothing is hovered. */
  time: number | null;
  /** The local row being hovered (it draws its own native crosshair). Null for no hover or a remote cursor. */
  source: Timeframe | null;
  /** Number of other live windows (set by the sync layer). */
  peers: number;
  set: (time: number, source: Timeframe) => void;
  /** Clears only if `source` still owns the cursor (a leave must not wipe a newer hover). */
  clear: (source: Timeframe) => void;
  /** Applies a cursor from another window. A local hover wins and is never overwritten. */
  setRemote: (time: number | null) => void;
  setPeers: (n: number) => void;
}

export const cursorInit: StateCreator<CursorState, [], [], CursorState> = (set, get) => ({
  time: null,
  source: null,
  peers: 0,
  set: (time, source) => {
    const s = get();
    if (s.time === time && s.source === source) return;
    set({ time, source });
  },
  clear: (source) => {
    if (get().source !== source) return;
    set({ time: null, source: null });
  },
  setRemote: (time) => {
    const s = get();
    if (s.source !== null) return;
    if (s.time === time) return;
    set({ time, source: null });
  },
  setPeers: (n) => {
    const s = get();
    if (s.peers === n && !(n === 0 && s.source === null && s.time !== null)) return;
    set(n === 0 && s.source === null ? { peers: n, time: null } : { peers: n });
  },
});

export const useCursorStore = create<CursorState>()(cursorInit);
