/** F11 — Scenario Studio selection (ephemeral UI state; never persisted or replicated). */
import { create } from "zustand";

interface ScenarioUiState {
  scenarioId: string | null;
  branch: number;
  select: (scenarioId: string | null) => void;
  selectBranch: (branch: number) => void;
  reset: () => void;
}

export const useScenarioStore = create<ScenarioUiState>()((set) => ({
  scenarioId: null,
  branch: 0,
  select: (scenarioId) => set({ scenarioId, branch: 0 }),
  selectBranch: (branch) => set({ branch }),
  reset: () => set({ scenarioId: null, branch: 0 }),
}));