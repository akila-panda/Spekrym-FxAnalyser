/** DX4: which evidence step is hovered, shared by the chart chips and the "Why it qualified" rows. Window-scoped, memory only. */
import { create } from "zustand";

interface EvidenceState {
  hoverStep: number | null;
  setHover: (n: number | null) => void;
}

export const useEvidenceStore = create<EvidenceState>()((set, get) => ({
  hoverStep: null,
  setHover: (n) => {
    if (get().hoverStep !== n) set({ hoverStep: n });
  },
}));