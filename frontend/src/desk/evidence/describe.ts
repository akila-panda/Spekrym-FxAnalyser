/** DESK DK3 — progressive disclosure. describeObject(obj, depth): same id, same data, three presentations.
 *  headline → + explanation, supports, conflicts → + timing, data quality, relations.
 *  Distances are shown in pips with ATR secondary ("8.3 pips · 1.4 ATR"). Copy is neutral; no prediction language. */
import { toIsoUtc } from "@/lib/time";
import { PAIR_META, type Pair, type Timeframe } from "@/types/market";
import { levelName } from "@/desk/detect/levels/names";
import { structureKind } from "@/desk/detect/structure/kinds";
import { lifecycleState } from "@/desk/kernel/viewAsOf";
import type { ObjectConfluence } from "@/desk/confluence/confluence";
import type { AnalysisObject, Complexity, ObjectType, Relation } from "@/desk/types/schemas";
import { liquidityName } from "@/desk/detect/liquidity/names";
import { zoneName } from "@/desk/detect/sd/names";
import { paName } from "@/desk/detect/pa/names";

export type Depth = "headline" | "explanation" | "evidence";
export const DEPTH_FOR: Record<Complexity, Depth> = { minimal: "headline", standard: "explanation", advanced: "evidence" };

export const TYPE_LABEL: Record<ObjectType, string> = {
  swing: "Swing", structure_event: "Structure event", sr_level: "Support/resistance", reference_level: "Reference level",
  fvg: "Fair value gap", liquidity_pool: "Potential liquidity pool", sweep: "Sweep", sd_zone: "Supply/demand zone",
  trendline: "Trendline", range: "Range", impulse: "Impulse", candle_signal: "Candle signal", relation: "Relation",
};

export interface DescribeCtx {
  /** Chart TF being viewed; when it differs from source_tf the object is a quiet projection. */
  viewTf?: Timeframe;
  atr?: number | null;
  relations?: readonly Relation[];
  byId?: ReadonlyMap<string, AnalysisObject>;
  /** DK12 factor breakdown for this object (relation-derived factors are added; own grade factors are already listed). */
  confluence?: ObjectConfluence;
}

export interface Description {
  headline: string;
  explanation: string[];
  supports: string[];
  conflicts: string[];
  timing: string[];
  quality: string[];
  relations: string[];
}

export const fmtTime = (t: number): string => `${toIsoUtc(t).replace("T", " ").slice(0, 16)} UTC`;
export const fmtPrice = (pair: AnalysisObject["pair"], p: number): string => p.toFixed(PAIR_META[pair as Pair].decimals);
const pips = (pair: AnalysisObject["pair"], d: number): string => (d / PAIR_META[pair as Pair].pip).toFixed(1);

function span(o: AnalysisObject, atr?: number | null): string {
  const b = o.geometry.bands;
  if (b.length === 0) return "";
  const hi = Math.max(...b.map((x) => x.pHigh));
  const lo = Math.min(...b.map((x) => x.pLow));
  if (hi === lo) return fmtPrice(o.pair, hi);
  const h = hi - lo;
  const atrPart = atr && atr > 0 ? ` · ${(h / atr).toFixed(1)} ATR` : "";
  return `${fmtPrice(o.pair, lo)}–${fmtPrice(o.pair, hi)} (${pips(o.pair, h)} pips${atrPart})`;
}

export function typeName(o: AnalysisObject): string {
  if (o.type === "swing") return o.direction === "bear" ? "Swing high" : o.direction === "bull" ? "Swing low" : "Swing";
  const dir = o.direction === "bull" ? "Bullish " : o.direction === "bear" ? "Bearish " : "";
  const ln = levelName(o);
  if (ln) return ln;
  const lq = liquidityName(o);
  if (lq) return lq;
  const zn = zoneName(o);
  if (zn) return zn;
  const pn = paName(o);
  if (pn) return pn;
  const sk = structureKind(o);
  if (sk === "BOS" || sk === "CHoCH") return `${dir}${sk}`;
  if (sk === "protected") return o.direction === "bull" ? "Protected low" : "Protected high";
  return `${dir}${TYPE_LABEL[o.type]}`;
}

export function describeObject(o: AnalysisObject, depth: Depth, ctx: DescribeCtx = {}): Description {
  const rng = span(o, ctx.atr);
  const d: Description = {
    headline: `${o.source_tf} ${typeName(o)}${rng ? ` · ${rng}` : ""}`,
    explanation: [], supports: [], conflicts: [], timing: [], quality: [], relations: [],
  };
  if (depth === "headline") return d;

  const state = lifecycleState(o);
  d.explanation.push(
    ctx.viewTf && ctx.viewTf !== o.source_tf
      ? `Projected from ${o.source_tf} onto ${ctx.viewTf} — shown quiet; not a ${ctx.viewTf} object.`
      : `Native to ${o.source_tf}.`,
  );
  d.explanation.push(`Known at ${fmtTime(o.known_at)} (first knowable after its confirming bar closed).`);
  if (state) d.explanation.push(`State: ${state.replace(/_/g, " ")}.`);
  for (const e of o.evidence.slice(0, 2)) if (e.note) d.explanation.push(e.note);
  for (const f of o.grade?.factors ?? []) {
    if (f.status === "supports") d.supports.push(f.note ? `${f.label} — ${f.note}` : f.label);
    else if (f.status === "opposes") d.conflicts.push(f.note ? `${f.label} — ${f.note}` : f.label);
  }
  const cf = ctx.confluence;
  const rel = (x: { id: string }) => x.id.startsWith("mtf:") || x.id.startsWith("opp:");
  const fl = (x: { label: string; note?: string }) => (x.note ? `${x.label} — ${x.note}` : x.label);
  if (cf) {
    d.supports.push(...cf.supports.filter(rel).map(fl));
    d.conflicts.push(...cf.opposes.filter(rel).map(fl));
    if (cf.sharedOrigin > 0) d.explanation.push(`Shares its origin with ${cf.sharedOrigin} other object${cf.sharedOrigin === 1 ? "" : "s"} — counted once, not as extra confluence.`);
  }
  if (depth === "explanation") return d;

  d.timing.push(`Event: ${fmtTime(o.t_event)}`, `Known: ${fmtTime(o.known_at)}`,
    `Confirmed: ${o.confirmed_at === null ? "not yet" : fmtTime(o.confirmed_at)}`);
  for (const e of o.lifecycle) d.timing.push(`${e.kind.replace(/_/g, " ")} @ ${fmtTime(e.t)} (known ${fmtTime(e.known_at)})`);
  d.quality.push(
    `Source: ${o.provenance.dataKind === "sample" ? "sample data" : "live data"}`,
    `Detector: ${o.provenance.detector} v${o.provenance.detectorVersion} · rules ${o.provenance.rulesVersion}`,
  );
  const g = o.grade;
  if (g && [g.significance, g.relevance, g.quality, g.freshness].some((v) => v !== null)) {
    d.quality.push(`Grade (heuristic): significance ${g.significance ?? "–"} · relevance ${g.relevance ?? "–"} · quality ${g.quality ?? "–"} · freshness ${g.freshness ?? "–"}`);
  }
  for (const f of g?.factors ?? []) if (f.status === "unavailable") d.quality.push(`Unavailable input: ${f.label}`);
  for (const f of cf?.unavailable ?? []) if (f.id.startsWith("mtf:")) d.quality.push(`Unavailable input: ${f.label}`);
  if (cf && cf.independent > 0) d.quality.push(`Independent confluent groups (heuristic count): ${cf.independent}`);
  for (const r of ctx.relations ?? []) {
    if (r.aId !== o.id && r.bId !== o.id) continue;
    const other = r.aId === o.id ? r.bId : r.aId;
    const oo = ctx.byId?.get(other);
    d.relations.push(`${r.kind.replace(/_/g, " ")}: ${oo ? `${oo.source_tf} ${typeName(oo)}` : other}`);
  }
  return d;
}