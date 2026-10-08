import type { Annotation } from "@/types/annotations";
import type { Step } from "@/types/scan";
import type { Timeframe } from "@/types/market";
import { roleGroup } from "./roles";
import { shouldShow, type RoutingOverrides } from "./routing";

export interface VisibilityInput {
  annotations: readonly Annotation[];
  steps: readonly Step[];
  panelTf: Timeframe;
  /** Role groups switched off in the legend. */
  hiddenGroups: ReadonlySet<string>;
  /** Steps reveal: chosen step number, or null for everything. */
  step: number | null;
  overrides?: RoutingOverrides;
}

/** Routing, then legend toggles, then the Steps reveal.
 *  Reveal keeps context (step 0) and anything known at or before the chosen step's `known_at`. */
export function visibleAnnotations(i: VisibilityInput): Annotation[] {
  const chosen = i.step === null ? undefined : i.steps.find((s) => s.n === i.step);
  return i.annotations.filter((a) => {
    if (!shouldShow(a, i.panelTf, i.overrides)) return false;
    if (i.hiddenGroups.has(roleGroup(a.role))) return false;
    if (chosen && a.step !== 0 && a.known_at > chosen.known_at) return false;
    return true;
  });
}