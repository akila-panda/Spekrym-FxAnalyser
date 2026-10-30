/** F1 — Intelligence Canvas UI state (ephemeral; never persisted, never replicated).
 *  Holds the active mode and the shared selection that keeps chart + source list + insight panel in sync. */
import { create } from "zustand";

export const CANVAS_MODES = ["prepare", "explore", "monitor", "review"] as const;
export type CanvasMode = (typeof CANVAS_MODES)[number];
export const isCanvasMode = (v: unknown): v is CanvasMode =>
  typeof v === "string" && (CANVAS_MODES as readonly string[]).includes(v);

interface CanvasState {
  mode: CanvasMode;
  /** Shared selection: a source id or an insight id. Selecting one focuses the chart region. */
  selectedSourceId: string | null;
  selectedInsightId: string | null;
  setMode: (mode: CanvasMode) => void;
  selectSource: (id: string | null) => void;
  selectInsight: (id: string | null) => void;
}

export const useCanvasStore = create<CanvasState>()((set) => ({
  mode: "prepare",
  selectedSourceId: null,
  selectedInsightId: null,
  setMode: (mode) => set({ mode }),
  selectSource: (selectedSourceId) => set({ selectedSourceId }),
  selectInsight: (selectedInsightId) => set({ selectedInsightId }),
}));
