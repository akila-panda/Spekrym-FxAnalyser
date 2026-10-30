/** DESK DK3 — ephemeral analysis snapshot for the current view (never persisted, never replicated).
 *  Written by useDeskAnnotations; read by the evidence drawer. Holds only what is drawn, already as-of filtered. */
import { create } from "zustand";
import { buildConfluence, EMPTY_CONFLUENCE, type ConfluenceReport } from "@/desk/confluence/confluence";
import type { AnalysisObject, Relation } from "@/desk/types/schemas";

interface AnalysisState {
  objects: AnalysisObject[];
  relations: Relation[];
  /** DK12: derived in setAnalysis from objects + relations (never persisted). */
  confluence: ConfluenceReport;
  projected: ReadonlySet<string>;
  dataKind: "sample" | "live";
  viewTf: string | null;
  setAnalysis: (a: Pick<AnalysisState, "objects" | "relations" | "projected" | "dataKind" | "viewTf">) => void;
}

export const useAnalysisStore = create<AnalysisState>()((set) => ({
  objects: [],
  relations: [],
  confluence: EMPTY_CONFLUENCE,
  projected: new Set<string>(),
  dataKind: "sample",
  viewTf: null,
  setAnalysis: (a) => set({ ...a, confluence: buildConfluence(a.objects, a.relations) }),
}));