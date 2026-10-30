/** Timeline Sync state. Window-scoped and ephemeral: NOT replicated across windows. */
import { create } from "zustand";
import type { Timeframe } from "@/types/market";
import { clampSpan, DEFAULT_SPAN } from "./timelineMath";

/** D (and W) already align by the day; H4 is best-effort. */
export const TIMELINE_TFS: readonly Timeframe[] = ["H4", "H1", "M15", "M5", "M1"];
export const isTimelineTf = (tf: Timeframe): boolean => TIMELINE_TFS.includes(tf);

interface TimelineState {
  /** Slider position while not locked. */
  draft: number | null;
  locked: boolean;
  /** Left edge (UTC seconds) all synced rows are pinned to while locked. */
  anchor: number | null;
  /** Shared visible time width in seconds. Zooming any synced row changes it for all. */
  span: number;
  setDraft: (t: number) => void;
  /** Move the slider: moves the anchor live when locked, else just the draft. */
  setAnchor: (t: number) => void;
  sync: (t: number) => void;
  unlock: () => void;
  setSpan: (s: number) => void;
  reset: () => void;
}

export const useTimelineStore = create<TimelineState>()((set) => ({
  draft: null,
  locked: false,
  anchor: null,
  span: DEFAULT_SPAN,
  setDraft: (t) => set({ draft: t }),
  setAnchor: (t) => set((s) => (s.locked ? { anchor: t, draft: t } : { draft: t })),
  sync: (t) => set({ locked: true, anchor: t, draft: t }),
  unlock: () => set((s) => (s.locked ? { locked: false, draft: s.anchor ?? s.draft } : {})),
  setSpan: (s) => set((st) => (clampSpan(s) === st.span ? {} : { span: clampSpan(s) })),
  reset: () => set({ draft: null, locked: false, anchor: null, span: DEFAULT_SPAN }),
}));