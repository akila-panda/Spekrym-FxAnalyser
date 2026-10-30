/** F2 — Chart Mapping Engine (VI-2). Pure. Turns causal AnalysisObjects and IntelligenceInsights into
 *  ChartMapping visual instructions (what to highlight / focus / link to evidence) WITHOUT altering meaning.
 *  Causality is enforced here: nothing with known_at/availableAt > asOf is ever mapped. Generalises the
 *  role concept of desk/layers/adapter.ts (ROLE_FOR) into a cross-engine overlay instruction. */
import type { AnalysisObject, ObjectType } from "@/desk/types/schemas";
import type { ChartMapping, IntelligenceInsight } from "@/intel/contracts";

/** Object type → overlay primitive (the Spatial & Temporal Mapper refines these in a later phase). */
export const OVERLAY_FOR: Record<ObjectType, string> = {
  swing: "marker", structure_event: "line", sr_level: "level", reference_level: "level",
  fvg: "zone", liquidity_pool: "level", sweep: "event", sd_zone: "zone",
  trendline: "line", range: "zone", impulse: "line", candle_signal: "marker", relation: "link",
};

/** Insight kind → overlay primitive. Scenarios/forecasts get path/envelope; a risk warning is a marker. */
const OVERLAY_FOR_KIND: Record<IntelligenceInsight["kind"], string> = {
  observation: "marker", interpretation: "annotation", scenario: "path", forecast: "envelope", risk_warning: "warning",
};

export interface MapOptions {
  /** UTC seconds; Infinity = latest. Objects/insights after this are not mapped. */
  asOf?: number;
  /** Object/insight id to render "focused" (others "visible"). */
  focusId?: string | null;
}

const vis = (id: string, focusId: string | null | undefined): ChartMapping["visibility"] =>
  focusId && focusId === id ? "focused" : "visible";

const objEvidence = (o: AnalysisObject): string[] =>
  o.evidence.map((e) => e.objectId ?? e.note ?? "").filter((s): s is string => s.length > 0);

const anchorRange = (o: AnalysisObject): [number, number] => {
  const ts = o.geometry.anchorTimes;
  return [Math.min(...ts), Math.max(...ts)];
};

/** One object → one ChartMapping. Pure; does not check causality (buildMappings does). */
export function mapObject(o: AnalysisObject, opts: MapOptions = {}): ChartMapping {
  return {
    mappingId: `map:${o.id}`,
    sourceModule: o.provenance.detector,
    objectIds: [o.id],
    overlayType: OVERLAY_FOR[o.type],
    geometryRefs: [o.id],
    focusTimeRange: anchorRange(o),
    visibility: vis(o.id, opts.focusId),
    evidenceIds: objEvidence(o),
  };
}

/** One insight → one ChartMapping. An insight is not geometry itself; it references objects. */
export function mapInsight(i: IntelligenceInsight, opts: MapOptions = {}): ChartMapping {
  return {
    mappingId: `map:${i.id}`,
    sourceModule: i.sourceEngine,
    objectIds: [...i.objectIds],
    overlayType: OVERLAY_FOR_KIND[i.kind],
    geometryRefs: [...i.objectIds],
    ...(i.expiresAt !== undefined ? { focusTimeRange: [i.observedAt, i.expiresAt] as [number, number] } : {}),
    visibility: vis(i.id, opts.focusId),
    evidenceIds: [...i.evidenceIds],
    ...(i.kind === "scenario" ? { scenarioId: i.id } : {}),
  };
}

export interface BuildInput {
  objects?: readonly AnalysisObject[];
  insights?: readonly IntelligenceInsight[];
  asOf?: number;
  focusId?: string | null;
}

/** Build every chart mapping for a view, causally filtered: an object is mapped only once its
 *  known_at <= asOf, an insight only once its availableAt <= asOf. Never maps the future. */
export function buildMappings(input: BuildInput): ChartMapping[] {
  const asOf = input.asOf ?? Infinity;
  const focusId = input.focusId ?? null;
  const out: ChartMapping[] = [];
  for (const o of input.objects ?? []) if (o.known_at <= asOf) out.push(mapObject(o, { asOf, focusId }));
  for (const i of input.insights ?? []) if (i.availableAt <= asOf) out.push(mapInsight(i, { asOf, focusId }));
  return out;
}
