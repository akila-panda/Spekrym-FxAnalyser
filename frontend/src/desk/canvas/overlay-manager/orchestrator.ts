/** F3 — Visual Intelligence Orchestrator + Smart Overlay Manager (VI-3). Pure. Owns visual COHERENCE,
 *  never truth: it normalizes, relates, deduplicates, resolves conflicts, and applies a clutter budget over
 *  ChartMappings from many engines. Correlated mappings (same geometry) collapse to one primary + an
 *  evidence stack — four observations of one zone are NOT four confirmations. Conflicts are EXPOSED, never
 *  averaged into a score. P0 items (safety / invalidation) are never hidden, even under Simplify. */
import type { ChartMapping } from "@/intel/contracts";

export type Polarity = "support" | "oppose" | "neutral";
/** 0 = P0 safety/invalidation (never hidden) · 1 actionable · 2 evidence · 3 background. */
export type Priority = 0 | 1 | 2 | 3;

export interface OverlayItem {
  mapping: ChartMapping;
  /** Overrides the default derived from overlayType. */
  priority?: Priority;
  /** Explicit dedup group; otherwise derived from the shared geometry. */
  group?: string;
  polarity?: Polarity;
}

export interface OverlayGroup {
  key: string;
  primary: ChartMapping;
  /** The correlated siblings behind the primary (the evidence stack). */
  stack: ChartMapping[];
  sources: string[];
  priority: Priority;
  polarities: Polarity[];
}

export interface Conflict {
  key: string;
  supports: string[]; // mappingIds
  opposes: string[];  // mappingIds
}

export interface OrchestratedView {
  /** Visible groups (all P0 + non-P0 within budget), highest priority first. */
  groups: OverlayGroup[];
  /** Groups collapsed by the clutter budget (never P0); their evidence is retained. */
  collapsed: OverlayGroup[];
  /** Exposed disagreements — supports vs opposes on the same geometry; never merged. */
  conflicts: Conflict[];
}

export interface OrchestrateOptions {
  /** Max number of visible non-P0 groups. Default: unlimited. */
  clutterBudget?: number;
  /** Simplify collapses all non-P0 groups; P0 stays. */
  simplify?: boolean;
}

const DEFAULT_PRIORITY = (overlayType: string): Priority => (overlayType === "warning" ? 0 : 2);
const priorityOf = (it: OverlayItem): Priority => it.priority ?? DEFAULT_PRIORITY(it.mapping.overlayType);
const keyOf = (it: OverlayItem): string => it.group ?? [...it.mapping.geometryRefs].sort().join("|");

export function orchestrate(items: readonly OverlayItem[], opts: OrchestrateOptions = {}): OrchestratedView {
  // ---- relate: bucket by shared geometry (or explicit group) ----
  const buckets = new Map<string, OverlayItem[]>();
  for (const it of items) {
    const k = keyOf(it);
    (buckets.get(k) ?? buckets.set(k, []).get(k)!).push(it);
  }

  const groups: OverlayGroup[] = [];
  const conflicts: Conflict[] = [];
  for (const [key, members] of buckets) {
    // ---- dedup: one primary (highest priority), the rest become the evidence stack ----
    const sorted = [...members].sort((a, b) => priorityOf(a) - priorityOf(b));
    const primary = sorted[0]!.mapping;
    const stack = sorted.slice(1).map((m) => m.mapping);
    const sources = [...new Set(members.map((m) => m.mapping.sourceModule))];
    const polarities = members.map((m) => m.polarity ?? "neutral");
    const priority = priorityOf(sorted[0]!);
    groups.push({ key, primary, stack, sources, priority, polarities });

    // ---- resolve conflicts: expose support vs oppose, never average ----
    const supports = members.filter((m) => m.polarity === "support").map((m) => m.mapping.mappingId);
    const opposes = members.filter((m) => m.polarity === "oppose").map((m) => m.mapping.mappingId);
    if (supports.length > 0 && opposes.length > 0) conflicts.push({ key, supports, opposes });
  }

  // ---- apply visibility / clutter budget: P0 always visible ----
  groups.sort((a, b) => a.priority - b.priority || a.key.localeCompare(b.key));
  const budget = opts.simplify ? 0 : opts.clutterBudget ?? Infinity;
  const visible: OverlayGroup[] = [];
  const collapsed: OverlayGroup[] = [];
  let nonP0Shown = 0;
  for (const g of groups) {
    if (g.priority === 0) { visible.push(g); continue; } // never hidden
    if (nonP0Shown < budget) { visible.push(g); nonP0Shown++; } else collapsed.push(g);
  }

  return { groups: visible, collapsed, conflicts };
}
