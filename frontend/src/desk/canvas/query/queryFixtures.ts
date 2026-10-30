/** F19 — frozen "sample" objects/insights for the Visual Query (the shared sample has a single object). */
import type { AnalysisObject } from "@/desk/types/schemas";
import type { IntelligenceInsight } from "@/intel/contracts";
import { SAMPLE_ENGINE_OBJECTS, SAMPLE_NOW as N } from "@/intel/fixtures";

const base = SAMPLE_ENGINE_OBJECTS[0]!;
const obj = (type: AnalysisObject["type"], id: string, t: number, known: number, detector: string, evidence: AnalysisObject["evidence"] = []): AnalysisObject => ({
  ...base, id, type, t_event: t, known_at: known, geometry: { bands: [{ pHigh: 1.103, pLow: 1.1022 }], anchorTimes: [t] },
  lifecycle: [{ kind: "established", t, known_at: known }], provenance: { ...base.provenance, detector }, evidence,
});
export const QUERY_OBJECTS: AnalysisObject[] = [
  base,
  obj("fvg", "fvg:EUR_USD:H1:1", N - 3_600, N - 3_000, "fvg"),
  obj("sweep", "sweep:EUR_USD:M15:1", N - 1_800, N - 1_700, "sweep", [{ objectId: base.id }]),
  obj("structure_event", "bos:EUR_USD:M15:1", N - 600, N - 500, "structure"),
  obj("sweep", "sweep:EUR_USD:M15:2", N + 5_000, N + 5_100, "sweep"), // not knowable yet
];
export const QUERY_INSIGHTS: IntelligenceInsight[] = [
  { id: "ins:sw:1", sourceEngine: "session", sourceVersion: "sample-0", instrument: "EUR_USD", observedAt: N - 1_800, availableAt: N - 1_700, kind: "observation", status: "active",
    evidenceIds: ["prov:sw:1"], objectIds: ["sweep:EUR_USD:M15:1"], visualizationIds: [], provenanceId: "prov:sw:1" },
];