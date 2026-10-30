/** DESK DK6 — the top-down walk: step order, inbox candidates per step, triage state. Pure. */
import { DEFAULTS } from "@/desk/methodology/defaults";
import { lifecycleState, viewAsOf } from "@/desk/kernel/viewAsOf";
import type { AnalysisObject, Decision, ObjectType } from "@/desk/types/schemas";
import type { Timeframe } from "@/types/market";

export const STEPS = ["W", "D", "H4", "H1", "M15", "M5", "M1"] as const satisfies readonly Timeframe[];
export type Step = (typeof STEPS)[number];

export const stepIndex = (s: Step): number => STEPS.indexOf(s);
/** Move by `delta` steps, clamped to W…M1. */
export const moveStep = (s: Step, delta: number): Step =>
  STEPS[Math.min(STEPS.length - 1, Math.max(0, stepIndex(s) + delta))] as Step;

/** Object types a trader triages as levels/zones. Swings, structure events, sweeps, impulses etc. are context, not inbox items. */
export const INBOX_TYPES: ReadonlySet<ObjectType> = new Set<ObjectType>([
  "sr_level", "reference_level", "fvg", "liquidity_pool", "sd_zone", "trendline", "range",
]);
export const SPENT = new Set(["broken", "superseded", "invalidated", "fully_mitigated", "filled", "inverted", "resolved"]);
/** Per-step inbox cap = the existing Advanced per-layer cap (no new number). */
export const INBOX_CAP = DEFAULTS.caps.advancedPerLayer;

export type Triage = Decision["action"] | null;
export interface InboxItem { object: AnalysisObject; custom: boolean; triage: Triage }

export const isCustomObject = (o: Pick<AnalysisObject, "provenance">): boolean => o.provenance.detector.startsWith("custom");

/** Candidates for one step: native objects of that TF knowable at `asOf` and not spent, best first and capped;
 *  the trader's custom levels for the step are always appended. Decisions are keyed by object id. */
export function buildInbox(
  objects: readonly AnalysisObject[], customs: readonly AnalysisObject[], step: Step, asOf: number,
  decisions: ReadonlyMap<string, Decision>,
): InboxItem[] {
  const detected = viewAsOf(objects, asOf)
    .filter((o) => o.source_tf === step && INBOX_TYPES.has(o.type) && !SPENT.has(lifecycleState(o) ?? ""))
    .sort((a, b) => (b.grade?.significance ?? -1) - (a.grade?.significance ?? -1) || b.known_at - a.known_at || (a.id < b.id ? -1 : 1))
    .slice(0, INBOX_CAP);
  const own = customs.filter((o) => o.source_tf === step && o.known_at <= asOf).sort((a, b) => a.known_at - b.known_at);
  return [...detected, ...own].map((object) => ({
    object, custom: isCustomObject(object), triage: decisions.get(object.id)?.action ?? null,
  }));
}