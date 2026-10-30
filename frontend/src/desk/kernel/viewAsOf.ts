/** DESK DK2 — the ONE as-of path (chart, replay, brief, export). Keeps objects with known_at <= t and
 *  folds lifecycle/confirmed_at to what was knowable at t. Pure; never mutates input. */
import type { AnalysisObject, Relation } from "@/desk/types/schemas";

export function viewAsOf(objects: readonly AnalysisObject[], t: number): AnalysisObject[] {
  const out: AnalysisObject[] = [];
  for (const o of objects) {
    if (o.known_at > t) continue;
    out.push({
      ...o,
      confirmed_at: o.confirmed_at !== null && o.confirmed_at <= t ? o.confirmed_at : null,
      lifecycle: o.lifecycle.filter((e) => e.known_at <= t),
    });
  }
  return out;
}

export const viewRelationsAsOf = (rels: readonly Relation[], t: number): Relation[] =>
  rels.filter((r) => r.known_at <= t);

/** Lifecycle state of an object (as already folded by viewAsOf): last event kind, or null. */
export function lifecycleState(o: Pick<AnalysisObject, "lifecycle">): string | null {
  let last: { kind: string; t: number } | null = null;
  for (const e of o.lifecycle) if (!last || e.t >= last.t) last = { kind: e.kind, t: e.t };
  return last ? last.kind : null;
}