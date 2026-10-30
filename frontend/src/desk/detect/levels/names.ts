/** DESK DK5 — display names for sr_level / reference_level, derived only from the (as-of folded) object. */
import type { AnalysisObject } from "@/desk/types/schemas";

const factor = (o: Pick<AnalysisObject, "grade">, id: string) => o.grade?.factors.find((f) => f.id === id);

/** Respected reactions: counted at establishment + later tests + a role-reversal retest. */
export const touchCount = (o: Pick<AnalysisObject, "grade" | "lifecycle">): number =>
  (factor(o, "touches")?.value ?? 0) + o.lifecycle.filter((e) => e.kind === "tested" || e.kind === "role_reversed").length;

export function levelName(o: Pick<AnalysisObject, "type" | "grade" | "lifecycle" | "direction">): string | null {
  if (o.type === "reference_level") return factor(o, "label")?.label ?? "Reference level";
  if (o.type !== "sr_level") return null;
  const reversed = o.lifecycle.some((e) => e.kind === "role_reversed");
  const support = (o.direction === "bull") !== reversed;
  return `${support ? "Support" : "Resistance"} ×${touchCount(o)}${factor(o, "strong") ? " (strong)" : ""}`;
}