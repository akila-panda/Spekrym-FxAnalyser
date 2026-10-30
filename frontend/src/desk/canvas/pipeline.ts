/** GF1 — Canvas composition pipeline. Pure. Wires the VI-2/VI-3/VI-4 stages end to end:
 *  objects+insights → ChartMappings (causal, F2) → orchestrate (dedup/conflict/clutter, F3) →
 *  a VisualPrimitive per visible overlay (F4). This is what the Intelligence Canvas renders: one
 *  composed, de-cluttered, causal overlay set — engines never draw directly. */
import type { AnalysisObject } from "@/desk/types/schemas";
import type { ChartMapping, IntelligenceInsight } from "@/intel/contracts";
import { buildMappings } from "./chart-mapping/mapper";
import { orchestrate, type OrchestratedView, type OverlayItem, type Priority } from "./overlay-manager/orchestrator";
import { objectToPrimitive, type VisualPrimitive } from "./rendering/primitives";

export interface ComposeInput {
  objects?: readonly AnalysisObject[];
  insights?: readonly IntelligenceInsight[];
  /** UTC seconds; Infinity = latest. Nothing after this is composed. */
  asOf?: number;
  focusId?: string | null;
  clutterBudget?: number;
  simplify?: boolean;
  /** Optional per-mapping priority overrides (keyed by mappingId). */
  priorities?: Record<string, Priority>;
}

export interface ComposedOverlay {
  key: string;
  primary: ChartMapping;
  /** Primitive kind if object-backed, else the mapping's overlayType. */
  kind: string;
  sources: string[];
  stackCount: number;
  priority: Priority;
  evidenceCount: number;
  primitive?: VisualPrimitive;
}

export interface ComposedCanvas {
  mappings: ChartMapping[];
  view: OrchestratedView;
  overlays: ComposedOverlay[];
  collapsedCount: number;
  conflictCount: number;
}

export function composeCanvas(input: ComposeInput): ComposedCanvas {
  const asOf = input.asOf ?? Infinity;
  const index = new Map((input.objects ?? []).map((o) => [o.id, o]));

  const mappings = buildMappings({ objects: input.objects, insights: input.insights, asOf, focusId: input.focusId ?? null });
  const items: OverlayItem[] = mappings.map((m) => {
    const p = input.priorities?.[m.mappingId];
    return p !== undefined ? { mapping: m, priority: p } : { mapping: m };
  });
  const view = orchestrate(items, { clutterBudget: input.clutterBudget, simplify: input.simplify });

  const to = Number.isFinite(asOf) ? asOf : undefined;
  const overlays: ComposedOverlay[] = view.groups.map((g) => {
    const objId = g.primary.geometryRefs[0];
    const obj = objId ? index.get(objId) : undefined;
    const primitive = obj ? objectToPrimitive(obj, { ...(to !== undefined ? { to } : {}) }) : undefined;
    const evidenceCount = g.primary.evidenceIds.length + g.stack.reduce((n, m) => n + m.evidenceIds.length, 0);
    return {
      key: g.key, primary: g.primary, kind: primitive?.kind ?? g.primary.overlayType,
      sources: g.sources, stackCount: g.stack.length, priority: g.priority, evidenceCount,
      ...(primitive ? { primitive } : {}),
    };
  });

  return { mappings, view, overlays, collapsedCount: view.collapsed.length, conflictCount: view.conflicts.length };
}
