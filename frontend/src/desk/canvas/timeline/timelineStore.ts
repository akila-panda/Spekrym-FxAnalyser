/** F12 — replay cursor (ephemeral UI state; never persisted or replicated). asOf null = live/latest. */
import { create } from "zustand";

interface TimelineState {
  asOf: number | null;
  playing: boolean;
  setAsOf: (asOf: number | null) => void;
  setPlaying: (playing: boolean) => void;
  reset: () => void;
}

export const useTimelineStore = create<TimelineState>()((set) => ({
  asOf: null,
  playing: false,
  setAsOf: (asOf) => set({ asOf }),
  setPlaying: (playing) => set({ playing }),
  reset: () => set({ asOf: null, playing: false }),
}));