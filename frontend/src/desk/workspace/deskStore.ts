/** DESK DK1 — persisted Desk preferences (local only, never replicated): which app (scan|desk),
 *  which area (my|analysis), the MY DESK workflow, complexity, per-workflow layouts and focus sets.
 *  Pattern copies review/reviewStore: pure parse, try/catch persist, drop-on-corrupt, versioned. */
import { create } from "zustand";
import { createLocalStore } from "@/desk/lib/storage";
import type { Complexity } from "@/desk/types/schemas";
import { DEFAULT_COMPLEXITY, isComplexity } from "./complexity";

export type AppId = "scan" | "desk";
export type DeskArea = "my" | "analysis";
/** MY DESK workflows (narrower than widgetRegistry.Workflow, which also includes "analysis"). */
export type DeskWorkflow = "prepare" | "live" | "review";
export const WORKFLOWS: readonly DeskWorkflow[] = ["prepare", "live", "review"];

export interface DeskPrefs {
  app: AppId;
  area: DeskArea;
  workflow: DeskWorkflow;
  complexity: Complexity;
  layoutByWorkflow: Record<string, string>;
  focusSets: Record<string, string[]>;
}

const DEFAULTS: DeskPrefs = {
  app: "scan", area: "my", workflow: "prepare", complexity: DEFAULT_COMPLEXITY,
  layoutByWorkflow: {}, focusSets: {},
};

const isWorkflow = (v: unknown): v is DeskWorkflow => v === "prepare" || v === "live" || v === "review";

export function parsePrefs(raw: unknown): DeskPrefs {
  if (!raw || typeof raw !== "object") return { ...DEFAULTS };
  const o = raw as Partial<DeskPrefs>;
  return {
    app: o.app === "desk" ? "desk" : "scan",
    area: o.area === "analysis" ? "analysis" : "my",
    workflow: isWorkflow(o.workflow) ? o.workflow : "prepare",
    complexity: isComplexity(o.complexity) ? o.complexity : DEFAULT_COMPLEXITY,
    layoutByWorkflow: o.layoutByWorkflow && typeof o.layoutByWorkflow === "object" ? { ...o.layoutByWorkflow } : {},
    focusSets: o.focusSets && typeof o.focusSets === "object" ? { ...o.focusSets } : {},
  };
}

const store = createLocalStore<DeskPrefs>({
  name: "workspace", version: 1, parse: parsePrefs, empty: () => ({ ...DEFAULTS }),
});

interface DeskState extends DeskPrefs {
  setApp: (app: AppId) => void;
  setArea: (area: DeskArea) => void;
  setWorkflow: (workflow: DeskWorkflow) => void;
  setComplexity: (complexity: Complexity) => void;
  setFocusSet: (workflow: DeskWorkflow, widgetIds: string[]) => void;
}

export const useDeskStore = create<DeskState>()((set) => ({
  ...store.load(),
  setApp: (app) => set({ app }),
  setArea: (area) => set({ area }),
  setWorkflow: (workflow) => set({ workflow }),
  setComplexity: (complexity) => set({ complexity }),
  setFocusSet: (workflow, widgetIds) => set((s) => ({ focusSets: { ...s.focusSets, [workflow]: [...widgetIds] } })),
}));

// Persist the preference slice (never the actions) on every change.
useDeskStore.subscribe((s) => {
  const { app, area, workflow, complexity, layoutByWorkflow, focusSets } = s;
  store.save({ app, area, workflow, complexity, layoutByWorkflow, focusSets });
});

export const selectPrefs = (s: DeskState): DeskPrefs => {
  const { app, area, workflow, complexity, layoutByWorkflow, focusSets } = s;
  return { app, area, workflow, complexity, layoutByWorkflow, focusSets };
};
