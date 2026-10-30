/** F8 — Explore view prefs (local only, never replicated): which engines the trader has toggled off.
 *  Presentation only — never read by detection. Key: spekrym.desk.explore.v1. */
import { create } from "zustand";
import { createLocalStore } from "@/desk/lib/storage";

export interface ExplorePrefs { hiddenEngines: string[] }

export function parseExplore(raw: unknown): ExplorePrefs {
  const h = (raw as Partial<ExplorePrefs> | null)?.hiddenEngines;
  return { hiddenEngines: Array.isArray(h) ? h.filter((x): x is string => typeof x === "string") : [] };
}

const store = createLocalStore<ExplorePrefs>({
  name: "explore", version: 1, parse: parseExplore, empty: () => ({ hiddenEngines: [] }),
});

interface ExploreState extends ExplorePrefs {
  toggleEngine: (id: string) => void;
  showAll: () => void;
}

export const useExploreStore = create<ExploreState>()((set) => ({
  ...store.load(),
  toggleEngine: (id) => set((s) => ({
    hiddenEngines: s.hiddenEngines.includes(id) ? s.hiddenEngines.filter((x) => x !== id) : [...s.hiddenEngines, id],
  })),
  showAll: () => set({ hiddenEngines: [] }),
}));

useExploreStore.subscribe((s) => store.save({ hiddenEngines: s.hiddenEngines }));