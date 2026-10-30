/** DESK DK4 — decode a structure_event's kind from its id anchors (last anchor = code). */
import type { AnalysisObject } from "@/desk/types/schemas";

export const PROTECTED_CODE = 3;
export type StructureKind = "BOS" | "CHoCH" | "protected";

export function structureKind(o: Pick<AnalysisObject, "type" | "geometry">): StructureKind | null {
  if (o.type !== "structure_event") return null;
  const code = o.geometry.anchorTimes[o.geometry.anchorTimes.length - 1];
  return code === 1 ? "BOS" : code === 2 ? "CHoCH" : code === PROTECTED_CODE ? "protected" : null;
}