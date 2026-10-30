/** DESK DK12 — confluence & MTF relations. Pure; reads only already as-of-folded objects + relations.
 *  Per-object factor breakdown (supports / opposes / unavailable), contradictions as first-class facts,
 *  `origin_id` de-dupe (objects sharing an origin count once), and "multi-timeframe confluence areas"
 *  (descriptive overlap of ≥ 2 timeframes — never a prediction). Counts are heuristic, never probabilities. */
import { typeName } from "@/desk/evidence/describe";
import { canonicalHash } from "@/desk/lib/hash";
import { lifecycleState } from "@/desk/kernel/viewAsOf";
import { SPENT } from "@/desk/prepare/walk";
import type { AnalysisObject, ObjectType, Relation } from "@/desk/types/schemas";
import { TF_SECONDS, type Timeframe } from "@/types/market";

/** Types whose bull/bear direction is unambiguous enough to contradict another object. */
const DIRECTIONAL: ReadonlySet<ObjectType> = new Set<ObjectType>(["fvg", "sd_zone"]);
/** Types that can sit in a confluence area (they own a price band). */
const AREA_TYPES: ReadonlySet<ObjectType> = new Set<ObjectType>(["sr_level", "reference_level", "fvg", "liquidity_pool", "sd_zone", "range"]);
const BAND_RELATIONS = new Set<Relation["kind"]>(["overlap", "nested", "contains"]);

export interface ConfluenceFactor { id: string; label: string; status: "supports" | "opposes" | "unavailable"; note?: string }
export interface Contradiction { id: string; aId: string; bId: string; band?: { pHigh: number; pLow: number }; known_at: number; label: string }
export interface ConfluenceArea {
  id: string;
  pair: string;
  band: { pHigh: number; pLow: number };
  tfs: Timeframe[];
  memberIds: string[];
  /** Members after `origin_id` de-dupe: objects sharing an origin count once. */
  independent: number;
  direction: "bull" | "bear" | "mixed" | "none";
  contradictionIds: string[];
  known_at: number;
}
export interface ObjectConfluence {
  id: string;
  supports: ConfluenceFactor[];
  opposes: ConfluenceFactor[];
  unavailable: ConfluenceFactor[];
  /** Independent supporting groups (heuristic count, not a probability). */
  independent: number;
  sharedOrigin: number;
}
export interface ConfluenceReport {
  areas: ConfluenceArea[];
  contradictions: Contradiction[];
  byObject: Record<string, ObjectConfluence>;
}
export const EMPTY_CONFLUENCE: ConfluenceReport = { areas: [], contradictions: [], byObject: {} };

const active = (o: AnalysisObject): boolean => !SPENT.has(lifecycleState(o) ?? "");
const tfRank = (o: AnalysisObject): number => TF_SECONDS[o.source_tf as Timeframe];
const group = (o: AnalysisObject): string => o.origin_id ?? o.id;
const lbl = (o: AnalysisObject): string => `${o.source_tf} ${typeName(o)}`;
const opposed = (a: AnalysisObject, b: AnalysisObject): boolean =>
  DIRECTIONAL.has(a.type) && DIRECTIONAL.has(b.type) && !!a.direction && !!b.direction && a.direction !== b.direction;

function envelope(os: readonly AnalysisObject[]): { pHigh: number; pLow: number } {
  let pLow = Infinity;
  let pHigh = -Infinity;
  for (const o of os) for (const b of o.geometry.bands) { pLow = Math.min(pLow, b.pLow); pHigh = Math.max(pHigh, b.pHigh); }
  return { pHigh, pLow };
}

export function buildConfluence(objects: readonly AnalysisObject[], relations: readonly Relation[]): ConfluenceReport {
  const byId = new Map(objects.map((o) => [o.id, o]));
  const live = (id: string): AnalysisObject | undefined => {
    const o = byId.get(id);
    return o && active(o) ? o : undefined;
  };
  const shared = new Map<string, Set<string>>();
  for (const o of objects) if (o.origin_id) (shared.get(o.origin_id) ?? shared.set(o.origin_id, new Set()).get(o.origin_id)!).add(o.id);

  // Contradictions + per-object factors from band relations between active objects.
  const contradictions: Contradiction[] = [];
  const f = new Map<string, { s: ConfluenceFactor[]; o: ConfluenceFactor[]; u: ConfluenceFactor[]; groups: Set<string> }>();
  const slot = (id: string) => f.get(id) ?? f.set(id, { s: [], o: [], u: [], groups: new Set() }).get(id)!;
  const adj = new Map<string, Set<string>>();
  for (const r of relations) {
    if (!BAND_RELATIONS.has(r.kind)) continue;
    const a = live(r.aId);
    const b = live(r.bId);
    if (!a || !b) continue;
    if (opposed(a, b)) {
      const id = `contradiction:${[a.id, b.id].sort().join("|")}`;
      contradictions.push({ id, aId: a.id, bId: b.id, band: r.band, known_at: r.known_at, label: `${lbl(a)} vs ${lbl(b)}` });
      slot(a.id).o.push({ id: `opp:${b.id}`, label: `Opposes ${lbl(b)}`, status: "opposes", note: "overlapping, opposite direction" });
      slot(b.id).o.push({ id: `opp:${a.id}`, label: `Opposes ${lbl(a)}`, status: "opposes", note: "overlapping, opposite direction" });
      continue;
    }
    for (const [x, y] of [[a, b], [b, a]] as const) {
      slot(x.id).s.push({ id: `mtf:${y.id}`, label: `${y.source_tf === x.source_tf ? "Overlaps" : "Confluent with"} ${lbl(y)}`, status: "supports", note: r.kind === "nested" || r.kind === "contains" ? r.kind : "overlap" });
      slot(x.id).groups.add(group(y));
    }
    if (AREA_TYPES.has(a.type) && AREA_TYPES.has(b.type)) {
      (adj.get(a.id) ?? adj.set(a.id, new Set()).get(a.id)!).add(b.id);
      (adj.get(b.id) ?? adj.set(b.id, new Set()).get(b.id)!).add(a.id);
    }
  }
  contradictions.sort((p, q) => q.known_at - p.known_at || (p.id < q.id ? -1 : 1));

  // Multi-timeframe confluence areas: connected overlap components with ≥ 2 timeframes and ≥ 2 independent groups.
  const areas: ConfluenceArea[] = [];
  const seen = new Set<string>();
  for (const start of [...adj.keys()].sort()) {
    if (seen.has(start)) continue;
    const comp: AnalysisObject[] = [];
    const stack = [start];
    seen.add(start);
    while (stack.length) {
      const id = stack.pop() as string;
      comp.push(byId.get(id) as AnalysisObject);
      for (const n of adj.get(id) ?? []) if (!seen.has(n)) { seen.add(n); stack.push(n); }
    }
    const tfs = [...new Set(comp.map((o) => o.source_tf as Timeframe))].sort((x, y) => TF_SECONDS[y] - TF_SECONDS[x]);
    const independent = new Set(comp.map(group)).size;
    if (tfs.length < 2 || independent < 2) continue;
    const ids = comp.map((o) => o.id).sort();
    const dirs = new Set(comp.filter((o) => DIRECTIONAL.has(o.type) && o.direction).map((o) => o.direction));
    const cIds = contradictions.filter((c) => ids.includes(c.aId) && ids.includes(c.bId)).map((c) => c.id);
    areas.push({
      id: `area:${comp[0]!.pair}:${canonicalHash(ids)}`, pair: comp[0]!.pair, band: envelope(comp), tfs, memberIds: ids, independent,
      direction: dirs.size === 0 ? "none" : dirs.size === 2 ? "mixed" : (dirs.has("bull") ? "bull" : "bear"),
      contradictionIds: cIds, known_at: Math.max(...comp.map((o) => o.known_at)),
    });
  }
  areas.sort((p, q) => q.independent - p.independent || q.known_at - p.known_at || (p.id < q.id ? -1 : 1));

  // Per-object report: own grade factors + MTF relation factors; unavailable stays explicit.
  const byObject: Record<string, ObjectConfluence> = {};
  for (const o of objects) {
    const s = slot(o.id);
    const own = o.grade?.factors ?? [];
    const toF = (x: (typeof own)[number]): ConfluenceFactor => ({ id: x.id, label: x.label, status: x.status, note: x.note });
    const hasHigher = objects.some((x) => x !== o && x.pair === o.pair && tfRank(x) > tfRank(o) && active(x));
    const touchesHigher = s.s.some((x) => { const y = byId.get(x.id.slice(4)); return !!y && tfRank(y) > tfRank(o); });
    const u = [...own.filter((x) => x.status === "unavailable").map(toF), ...s.u];
    if (!touchesHigher) u.push({ id: "mtf:none", label: hasHigher ? "No higher-timeframe overlap in view" : "No higher-timeframe objects in view", status: "unavailable" });
    const sh = o.origin_id ? (shared.get(o.origin_id)?.size ?? 1) - 1 : 0;
    const sup = [...own.filter((x) => x.status === "supports").map(toF), ...s.s];
    byObject[o.id] = {
      id: o.id, supports: sup, unavailable: u,
      opposes: [...own.filter((x) => x.status === "opposes").map(toF), ...s.o],
      independent: s.groups.size, sharedOrigin: sh,
    };
  }
  return { areas, contradictions, byObject };
}