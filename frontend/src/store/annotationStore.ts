import { create } from "zustand";
import type { Annotation } from "@/types/annotations";
import type { Step } from "@/types/scan";

interface AnnotationState {
  /** The active setup's annotations and steps. Empty when no setup is active. */
  annotations: readonly Annotation[];
  steps: readonly Step[];
  /** Steps reveal: chosen step number, or null to show everything. */
  step: number | null;
  /** Role groups switched off in the legend. */
  hiddenGroups: ReadonlySet<string>;
  setSetup: (setup: { annotations: readonly Annotation[]; steps: readonly Step[] } | null) => void;
  setStep: (step: number | null) => void;
  toggleGroup: (group: string) => void;
  showAllGroups: () => void;
}

export const useAnnotationStore = create<AnnotationState>()((set) => ({
  annotations: [],
  steps: [],
  step: null,
  hiddenGroups: new Set(),
  setSetup: (setup) => set({ annotations: setup?.annotations ?? [], steps: setup?.steps ?? [], step: null }),
  setStep: (step) => set({ step }),
  toggleGroup: (group) =>
    set((s) => {
      const next = new Set(s.hiddenGroups);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return { hiddenGroups: next };
    }),
  showAllGroups: () => set({ hiddenGroups: new Set() }),
}));