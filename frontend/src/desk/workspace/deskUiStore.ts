/** DESK DK1 — ephemeral, window-scoped Desk UI state (never persisted, never replicated).
 *  Focus on/off, Simplify previous level, selected object, and Desk's own as-of clock.
 *  Desk NEVER writes viewStore.asOf (that is replicated and would move Scan windows). */
import { create } from "zustand";
import type { Complexity } from "@/desk/types/schemas";
import { useDeskStore } from "./deskStore";

export type DeskAsOf = "latest" | number;

interface DeskUiState {
  focusOn: boolean;
  /** Non-null while Simplify is active; the level to restore to. */
  simplifyPrev: Complexity | null;
  selectedObjectId: string | null;
  /** Evidence drawer open (needs a selected object). */
  evidenceOpen: boolean;
  asOf: DeskAsOf;
  toggleFocus: () => void;
  setFocus: (on: boolean) => void;
  /** Toggle Minimal and back, remembering the exact previous level. */
  simplify: () => void;
  select: (objectId: string | null) => void;
  toggleEvidence: () => void;
  setEvidence: (open: boolean) => void;
  setAsOf: (asOf: DeskAsOf) => void;
}

export const useDeskUiStore = create<DeskUiState>()((set, get) => ({
  focusOn: false,
  simplifyPrev: null,
  selectedObjectId: null,
  evidenceOpen: false,
  asOf: "latest",
  toggleFocus: () => set((s) => ({ focusOn: !s.focusOn })),
  setFocus: (on) => set({ focusOn: on }),
  simplify: () => {
    const desk = useDeskStore.getState();
    if (get().simplifyPrev === null) {
      const prev = desk.complexity;
      desk.setComplexity("minimal");
      set({ simplifyPrev: prev });
    } else {
      desk.setComplexity(get().simplifyPrev!);
      set({ simplifyPrev: null });
    }
  },
  select: (selectedObjectId) => set((s) => ({ selectedObjectId, evidenceOpen: selectedObjectId === null ? false : s.evidenceOpen })),
  toggleEvidence: () => set((s) => ({ evidenceOpen: s.selectedObjectId !== null && !s.evidenceOpen })),
  setEvidence: (evidenceOpen) => set((s) => ({ evidenceOpen: evidenceOpen && s.selectedObjectId !== null })),
  setAsOf: (asOf) => set({ asOf }),
}));