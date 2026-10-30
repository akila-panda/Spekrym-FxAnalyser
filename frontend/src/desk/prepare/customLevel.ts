/** DESK DK6 — a trader-drawn level as a reference_level AnalysisObject (zero-height band). Pure.
 *  Label rides in grade.factors[label] (levelName reads it); group is carried as detector "custom:<group>". */
import { objectId } from "@/desk/lib/ids";
import type { AnalysisObject } from "@/desk/types/schemas";
import type { CustomLevel } from "./prepareStore";

export const CUSTOM_GROUPS = ["Level", "Target", "Invalidation", "Note"] as const;

export function customId(c: Pick<CustomLevel, "pair" | "tf" | "known_at" | "seq">): string {
  return objectId({ type: "reference_level", pair: c.pair, tf: c.tf, anchorTimes: [c.known_at, c.seq] });
}

export function customObject(c: CustomLevel, rulesVersion: string, dataKind: "sample" | "live"): AnalysisObject {
  return {
    id: c.id, type: "reference_level", layer: "levels", pair: c.pair, source_tf: c.tf,
    geometry: { bands: [{ pHigh: c.price, pLow: c.price }], anchorTimes: [c.known_at, c.seq] },
    t_event: c.known_at, known_at: c.known_at, confirmed_at: null, lifecycle: [],
    grade: {
      significance: null, relevance: null, quality: null, freshness: null,
      factors: [{ id: "label", label: c.label, status: "supports", ...(c.notes ? { note: c.notes } : {}) }],
    },
    provenance: { rulesVersion, dataKind, detector: `custom:${c.group}`, detectorVersion: 0 },
    evidence: [{ t: c.known_at, note: `Custom ${c.group.toLowerCase()} added by you${c.notes ? `: ${c.notes}` : ""}` }],
  } as AnalysisObject;
}