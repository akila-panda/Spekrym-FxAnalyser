/** DESK DK14 — Market Change Feed. Pure: diff two as-of folds of the same objects into meaningful events only
 *  (entered zone · swept liquidity · FVG formed · structure break · invalidation · used up). `from` and `ref` go through the one
 *  viewAsOf path, so an event is never earlier than it was knowable. Copy is descriptive, never a forecast. */
import { fmtPrice, fmtTime, typeName } from "@/desk/evidence/describe";
import { structureKind } from "@/desk/detect/structure/kinds";
import { viewAsOf } from "@/desk/kernel/viewAsOf";
import { distanceToObject } from "@/desk/layers/relevance";
import { DEFAULTS } from "@/desk/methodology/defaults";
import type { AnalysisObject, LifecycleEvent } from "@/desk/types/schemas";
import { PAIR_META, type Pair } from "@/types/market";

export const FEED = { windowSec: 24 * 3600, cap: 40 } as const;
export type FeedKind = "entered" | "swept" | "fvg_formed" | "structure_break" | "invalidated" | "spent";
export const FEED_LABEL: Record<FeedKind, string> = {
  entered: "Price entered zone", swept: "Liquidity swept", fvg_formed: "FVG formed",
  structure_break: "Structure break", invalidated: "Invalidated", spent: "Used up",
};
export interface FeedEvent {
  id: string; kind: FeedKind; /** known_at of the fact (UTC s). */ t: number; objectId: string; tf: string; text: string; where: string; thesis: boolean;
}

const ENTER = new Set(["partially_mitigated", "tested", "partially_filled"]);
const INVALID = new Set(["invalidated", "broken", "inverted"]);
const USED = new Set(["fully_mitigated", "filled"]);
const ZONE_TYPES = new Set(["sd_zone", "sr_level", "fvg"]);

const key = (e: LifecycleEvent): string => `${e.kind}@${e.t}`;

function kindOf(o: AnalysisObject, life: LifecycleEvent | null): FeedKind | null {
  if (!life) {
    if (o.type === "fvg") return "fvg_formed";
    if (o.type === "sweep") return "swept";
    const k = structureKind(o);
    return k === "BOS" || k === "CHoCH" ? "structure_break" : null;
  }
  if (!ZONE_TYPES.has(o.type) && o.type !== "range") return null;
  if (ENTER.has(life.kind)) return "entered";
  if (INVALID.has(life.kind)) return "invalidated";
  if (USED.has(life.kind)) return "spent";
  return null;
}

/** Events that exist in `next` but not in `prev` (same objects, later fold). Pure. */
export function diffObjects(prev: readonly AnalysisObject[], next: readonly AnalysisObject[]): Array<{ o: AnalysisObject; kind: FeedKind; t: number; life: string | null }> {
  const before = new Map(prev.map((o) => [o.id, o]));
  const out: Array<{ o: AnalysisObject; kind: FeedKind; t: number; life: string | null }> = [];
  for (const o of next) {
    const p = before.get(o.id);
    if (!p) {
      const k = kindOf(o, null);
      if (k) out.push({ o, kind: k, t: o.known_at, life: null });
    }
    const seen = new Set((p?.lifecycle ?? []).map(key));
    for (const e of o.lifecycle) {
      if (seen.has(key(e))) continue;
      const k = kindOf(o, e);
      if (k) out.push({ o, kind: k, t: e.known_at, life: e.kind });
    }
  }
  return out;
}

export interface FeedInput {
  pair: Pair; objects: readonly AnalysisObject[]; ref: number; price: number | null; atr: number | null; acceptedIds?: ReadonlySet<string>;
}

export function buildFeed(i: FeedInput): FeedEvent[] {
  const ref = Number.isFinite(i.ref) ? i.ref : i.objects.reduce((m, o) => Math.max(m, o.known_at), 0);
  const next = viewAsOf(i.objects, ref);
  const prev = viewAsOf(i.objects, ref - FEED.windowSec);
  const accepted = i.acceptedIds ?? new Set<string>();
  const meta = PAIR_META[i.pair];
  const events: FeedEvent[] = [];
  for (const d of diffObjects(prev, next)) {
    const thesis = accepted.has(d.o.id);
    const dist = i.price !== null ? distanceToObject(d.o, i.price) : null;
    const near = dist === null || i.atr === null || i.atr <= 0 || dist <= DEFAULTS.relevanceAtr * i.atr;
    if (!near && !thesis) continue;
    const b = d.o.geometry.bands;
    const lo = b.length ? Math.min(...b.map((x) => x.pLow)) : null;
    const hi = b.length ? Math.max(...b.map((x) => x.pHigh)) : null;
    const range = lo === null || hi === null ? "" : lo === hi ? fmtPrice(i.pair, hi) : `${fmtPrice(i.pair, lo)}–${fmtPrice(i.pair, hi)}`;
    const away = dist === null ? "" : dist === 0 ? "price inside" : `${(dist / meta.pip).toFixed(1)} pips from price`;
    const name = `${d.o.source_tf} ${typeName(d.o)}`;
    const text = d.kind === "structure_break" ? `${name} (potential change in structure)` : d.kind === "spent" ? `${name} — ${d.life === "filled" ? "filled" : "fully mitigated"}` : name;
    events.push({
      id: `${d.kind}:${d.o.id}:${d.life ?? "new"}:${d.t}`, kind: d.kind, t: d.t, objectId: d.o.id, tf: d.o.source_tf,
      text: `${FEED_LABEL[d.kind]}: ${text}`, where: [range, away].filter(Boolean).join(" · "), thesis,
    });
  }
  return events.sort((a, b) => b.t - a.t || (a.id < b.id ? -1 : 1)).slice(0, FEED.cap);
}

export const feedTime = (e: FeedEvent): string => fmtTime(e.t);