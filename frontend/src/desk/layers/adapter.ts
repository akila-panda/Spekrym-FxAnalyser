/** DESK DK3 — AnalysisObject → existing Annotation (the chart's drawing contract). Pure; no new colours:
 *  roles map to existing --role-* tokens (see DESK_DESIGN §2). Projected objects are drawn faint with a source-TF badge. */
import type { Annotation } from "@/types/annotations";
import { TF_SECONDS, type Timeframe } from "@/types/market";
import { structureKind } from "@/desk/detect/structure/kinds";
import { lifecycleState } from "@/desk/kernel/viewAsOf";
import type { AnalysisObject, ObjectType } from "@/desk/types/schemas";
import { describeObject, typeName } from "@/desk/evidence/describe";
import { isOrderBlock } from "@/desk/detect/sd/names";

export const ROLE_FOR: Record<ObjectType, string> = {
  swing: "structure", structure_event: "structure", sr_level: "range", reference_level: "context",
  fvg: "imbalance", liquidity_pool: "liquidity", sweep: "sweep", sd_zone: "premium_discount",
  trendline: "structure", range: "range", impulse: "structure", candle_signal: "context", relation: "context",
};

const UNTESTED = new Set(["fresh", "open", "potential", "emerging", "established", "candidate"]);
const TOUCHED = new Set(["tested", "partially_mitigated", "partially_filled", "swept", "reaction_observed","active", "role_reversed", "failed_breakout"]);

/** Lifecycle → Annotation.state (levels only; zones have no state field). */
export function mapState(o: Pick<AnalysisObject, "lifecycle">): "untested" | "touched" | "mitigated" | undefined {
  const s = lifecycleState(o);
  if (!s) return undefined;
  return UNTESTED.has(s) ? "untested" : TOUCHED.has(s) ? "touched" : "mitigated";
}

export interface AdaptOpts {
  viewTf: Timeframe;
  /** Right edge (UTC s) for zones/levels: latest closed bar end, or as-of. */
  until: number;
  projected: ReadonlySet<string>;
  atr?: number | null;
}

export function toAnnotations(objects: readonly AnalysisObject[], opts: AdaptOpts): Annotation[] {
  const out: Annotation[] = [];
  for (const o of objects) {
    if (o.type === "relation") continue;
    const proj = opts.projected.has(o.id);
    const state = mapState(o);
    const spent = state === "mitigated";
    const why = describeObject(o, "explanation", { viewTf: opts.viewTf, atr: opts.atr }).explanation.join(" ");
    const base = {
      id: o.id,
       role: isOrderBlock(o) ? "order_block" : ROLE_FOR[o.type],
      tone: o.direction ?? ("neutral" as const),
      source_tf: o.source_tf as Timeframe,
      step: 0,
      known_at: o.known_at,
      label: o.type === "swing" ? o.grade?.factors.find((f) => f.id === "label")?.label :
        `${proj ? `${o.source_tf} · ` : ""}${typeName(o)}`,
      why,
      emphasis: proj || spent ? ("faint" as const) : ("normal" as const),
      visible_on: [opts.viewTf],
    };
    const t0 = o.geometry.anchorTimes[0] as number;
    const pt = o.geometry.points?.[0];
    const bands = o.geometry.bands;
    const hi = bands.length ? Math.max(...bands.map((b) => b.pHigh)) : null;
    const lo = bands.length ? Math.min(...bands.map((b) => b.pLow)) : null;

    if ((o.type === "trendline" || o.type === "structure_event") && (o.geometry.points?.length ?? 0) >= 2) {
      const dashed = structureKind(o) === "CHoCH" ? { dash: "dashed" as const } : {};
      out.push({ ...base, ...dashed, kind: "line", points: o.geometry.points!.map((p) => ({ t: p.t, p: p.p })) } as Annotation);
    } else if (o.type === "swing" || o.type === "sweep" || o.type === "candle_signal") {
      const price = pt?.p ?? (hi !== null && lo !== null ? (hi + lo) / 2 : null);
      if (price === null) continue;
      const shape = o.direction === "bull" ? "arrow_up" : o.direction === "bear" ? "arrow_down" : "circle";
      out.push({ ...base, kind: "marker", t0, price, shape } as Annotation);
    } else if (hi !== null && lo !== null && hi === lo) {
      out.push({ ...base, kind: "level", t0, price: hi, extend: "right", state } as Annotation);
    } else if (hi !== null && lo !== null) {
      const last = o.geometry.anchorTimes[o.geometry.anchorTimes.length - 1] as number;
      const end = o.type === "impulse" ? last + TF_SECONDS[o.source_tf as Timeframe] : opts.until;
      out.push({ ...base, kind: "zone", t0, t1: Math.max(end, t0 + 1), p_high: hi, p_low: lo } as Annotation);
    }
  }
  return out;
}