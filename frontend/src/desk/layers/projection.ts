/** DESK DK3 — projection ladder + visibility selection. "Detect high, project low": an object from a higher
 *  TF may be drawn (quiet) on any lower view TF; a lower-TF object is never drawn on a higher TF.
 *  Single as-of path (viewAsOf) → layer settings → ladder + relevance → caps. Pure. */
import { DEFAULTS } from "@/desk/methodology/defaults";
import { levelName } from "@/desk/detect/levels/names";
import { lifecycleState, viewAsOf } from "@/desk/kernel/viewAsOf";
import { LAYERS, type AnalysisObject, type Complexity } from "@/desk/types/schemas";
import { TF_SECONDS, type Timeframe } from "@/types/market";
import type { LayerSettingsMap } from "./layerStore";
import { isRelevant } from "./relevance";

/** G2-A: slots reserved for quiet higher-TF projections so native objects cannot starve them (per layer; Minimal: 1 of 3 total).
 *  Presentation only (not a methodology param, so rulesVersion is unchanged). Unused slots fall back to natives. */
export const PROJECTED_QUOTA = 2;
export const PROJECTED_QUOTA_MINIMAL = 1;
const isRound = (o: AnalysisObject): boolean => o.type === "reference_level" && (levelName(o) ?? "").startsWith("Round ");

export const isNative = (o: Pick<AnalysisObject, "source_tf">, viewTf: Timeframe): boolean => o.source_tf === viewTf;
export const projectsTo = (source: Timeframe, view: Timeframe): boolean => TF_SECONDS[view] < TF_SECONDS[source];

const TESTED = new Set(["tested", "partially_mitigated", "partially_filled", "reaction_observed"]);
const SPENT = new Set(["fully_mitigated", "invalidated", "filled", "broken", "inverted", "resolved", "superseded"]);

export interface SelectInput {
  objects: readonly AnalysisObject[];
  viewTf: Timeframe;
  /** UTC seconds; Infinity = latest. */
  asOf: number;
  settings: LayerSettingsMap;
  complexity: Complexity;
  price: number | null;
  atrView: number | null;
}
export interface Selection { objects: AnalysisObject[]; projected: Set<string> }

export function selectForView(i: SelectInput): Selection {
  const known = viewAsOf(i.objects, i.asOf);
  const ref = Number.isFinite(i.asOf) ? i.asOf : known.reduce((m, o) => Math.max(m, o.known_at), 0);
  const sec = TF_SECONDS[i.viewTf];
  const projected = new Set<string>();
  const kept: AnalysisObject[] = [];
  for (const o of known) {
    const s = i.settings[o.layer];
    if (!s.visible) continue;
    if (s.sourceTfs && !s.sourceTfs.includes(o.source_tf as Timeframe)) continue;
    if (o.grade?.significance != null && o.grade.significance < s.minSignificance) continue;
    if (s.lookbackBars !== null && o.t_event < ref - s.lookbackBars * sec) continue;
    const st = lifecycleState(o);
    if (st && TESTED.has(st) && !s.showTested) continue;
    if (st && SPENT.has(st) && !s.showInvalid) continue;
    // G2-B: round-number levels are shown only within the relevance window (native too), not the whole history.
    if (isRound(o) && isNative(o, i.viewTf) && !isRelevant(o, i.price, i.atrView)) continue;
    if (!isNative(o, i.viewTf)) {
      if (!projectsTo(o.source_tf as Timeframe, i.viewTf) || !s.projectFromHtf) continue;
      if (!isRelevant(o, i.price, i.atrView)) continue;
      projected.add(o.id);
    }
    kept.push(o);
  }
  const rank = (a: AnalysisObject, b: AnalysisObject) =>
    Number(projected.has(a.id)) - Number(projected.has(b.id)) ||
    (b.grade?.significance ?? 0) - (a.grade?.significance ?? 0) ||
    b.known_at - a.known_at ||
    (a.id < b.id ? -1 : 1);
  const caps = i.complexity === "advanced" ? DEFAULTS.caps.advancedPerLayer : DEFAULTS.caps.standardPerLayer;
  /** Take `cap` objects: natives first, but keep `quota` slots for projections (spare slots fall back to natives). */
  const take = (list: AnalysisObject[], cap: number, quota: number): AnalysisObject[] => {
    const nat = list.filter((o) => !projected.has(o.id));
    const prj = list.filter((o) => projected.has(o.id));
    const p = Math.min(prj.length, cap, Math.max(quota, cap - nat.length));
    return [...nat.slice(0, cap - p), ...prj.slice(0, p)];
  };
  let out: AnalysisObject[] = [];
  for (const l of LAYERS) {
    const cap = i.complexity === "minimal" ? Infinity : Math.min(caps, i.settings[l].maxObjects ?? Infinity);
    out.push(...take(kept.filter((o) => o.layer === l).sort(rank), cap, PROJECTED_QUOTA));
  }
  if (i.complexity === "minimal") out = take(out.sort(rank), DEFAULTS.caps.minimalTotal, PROJECTED_QUOTA_MINIMAL);
  const ids = new Set(out.map((o) => o.id));
  return { objects: out, projected: new Set([...projected].filter((id) => ids.has(id))) };
}