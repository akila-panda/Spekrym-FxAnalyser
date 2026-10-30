/** DESK DK3 — relations plumbing: overlap / nested / contains / shared_origin between objects. Pure.
 *  `nested` = a higher-TF object fully containing a lower-TF one ("multi-timeframe area" — never a prediction). */
import { relationId } from "@/desk/lib/ids";
import type { AnalysisObject, Relation } from "@/desk/types/schemas";
import { TF_SECONDS, type Timeframe } from "@/types/market";

const SKIP = new Set(["swing", "relation", "candle_signal"]);
const MAX_CANDIDATES = 300;

const envelope = (o: AnalysisObject): { lo: number; hi: number } | null => {
  if (o.geometry.bands.length === 0) return null;
  let lo = Infinity;
  let hi = -Infinity;
  for (const b of o.geometry.bands) {
    lo = Math.min(lo, b.pLow);
    hi = Math.max(hi, b.pHigh);
  }
  return { lo, hi };
};

export function buildRelations(objects: readonly AnalysisObject[]): Relation[] {
  const cand = objects
    .filter((o) => !SKIP.has(o.type))
    .sort((a, b) => b.known_at - a.known_at || (a.id < b.id ? -1 : 1))
    .slice(0, MAX_CANDIDATES);
  const out = new Map<string, Relation>();
  for (let i = 0; i < cand.length; i++) {
    for (let j = i + 1; j < cand.length; j++) {
      const a = cand[i] as AnalysisObject;
      const b = cand[j] as AnalysisObject;
      const known_at = Math.max(a.known_at, b.known_at);
      if (a.origin_id && a.origin_id === b.origin_id) {
        const id = relationId("shared_origin", a.id, b.id);
        out.set(id, { id, kind: "shared_origin", aId: a.id, bId: b.id, known_at });
      }
      const ea = envelope(a);
      const eb = envelope(b);
      if (!ea || !eb) continue;
      const lo = Math.max(ea.lo, eb.lo);
      const hi = Math.min(ea.hi, eb.hi);
      const flat = ea.hi === ea.lo || eb.hi === eb.lo;
      if (hi < lo || (hi === lo && !flat)) continue;
      const aHasB = ea.lo <= eb.lo && eb.hi <= ea.hi;
      const bHasA = eb.lo <= ea.lo && ea.hi <= eb.hi;
      let kind: Relation["kind"] = "overlap";
      let [x, y] = [a, b];
      if (aHasB || bHasA) {
        [x, y] = aHasB ? [a, b] : [b, a];
        kind = TF_SECONDS[x.source_tf as Timeframe] > TF_SECONDS[y.source_tf as Timeframe] ? "nested" : "contains";
      }
      const id = relationId(kind, x.id, y.id);
      out.set(id, { id, kind, aId: x.id, bId: y.id, band: { pHigh: hi, pLow: lo }, known_at });
    }
  }
  return [...out.values()].sort((p, q) => (p.id < q.id ? -1 : 1));
}