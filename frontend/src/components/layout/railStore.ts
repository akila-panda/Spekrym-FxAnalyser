/** DX3: which Level-2 section of the right rail is open. Window-scoped (class W): memory only, never replicated. */
import { create } from "zustand";

export const DEFAULT_SECTION = "why";

interface RailState {
  /** Section id, or null when every section is closed. */
  open: string | null;
  setOpen: (id: string | null) => void;
  reset: () => void;
}

export const useRailStore = create<RailState>()((set) => ({
  open: DEFAULT_SECTION,
  setOpen: (id) => set({ open: id }),
  reset: () => set({ open: DEFAULT_SECTION }),
}));