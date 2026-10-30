/** DESK DK1 — complexity axis helpers (pure). One global level; widgets gate via minLevel, objects
 *  via caps. Simplify/Focus are transient and live in deskUiStore, not here. */
import type { Complexity } from "@/desk/types/schemas";

export const COMPLEXITY_ORDER: readonly Complexity[] = ["minimal", "standard", "advanced"];
export const COMPLEXITY_LABEL: Record<Complexity, string> = {
  minimal: "Minimal", standard: "Standard", advanced: "Advanced",
};
export const DEFAULT_COMPLEXITY: Complexity = "standard";

export const isComplexity = (v: unknown): v is Complexity =>
  typeof v === "string" && (COMPLEXITY_ORDER as readonly string[]).includes(v);
