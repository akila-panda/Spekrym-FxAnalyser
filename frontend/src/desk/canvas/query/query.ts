/** F19 — Visual Query (VI-8). Pure + deterministic. Natural language → structured filters → chart ops.
 *  The translator is a SEAM (a rule-based one ships; an LLM may later replace it) but it can only SELECT verified
 *  objects: every filter is sanitised and every op is built from overlays/items that already exist and are causal at
 *  `asOf`. No geometry is ever authored here, nothing is hidden (ops only focus / window / open evidence), and an
 *  unknown reference is rejected and surfaced, never guessed. */
import { OBJECT_TYPES, type AnalysisObject } from "@/desk/types/schemas";
import type { ComposedOverlay } from "../pipeline";
import type { EngineItem } from "../integration/engineLayer";

export interface QueryFilters { objectTypes?: string[]; engines?: string[]; p0?: boolean; lastSec?: number; focusIds?: string[] }
/** CONTRACTS §9 ViewQuery (text/filters/asOf/focusTarget). */
export interface ViewQuery { text: string; filters: QueryFilters; asOf: number; focusTarget?: string }
export type ChartOp =
  | { op: "focus"; key: string }
  | { op: "time_range"; from: number; to: number }
  | { op: "open_evidence"; key: string; objectIds: string[]; evidenceIds: string[] };
export interface QueryContext {
  overlays: readonly ComposedOverlay[]; items: readonly EngineItem[]; objects: readonly AnalysisObject[]; asOf: number;
}
export interface Translation { filters: QueryFilters; understood: string[]; unmatched: string[] }
export type Translator = (text: string) => Translation;
export interface QueryResult {
  query: ViewQuery; understood: string[]; unmatched: string[]; rejected: string[];
  ops: ChartOp[]; overlays: ComposedOverlay[]; items: EngineItem[];
}

export const MAX_WINDOW_SEC = 7 * 86_400;
const ENGINES = ["observed", "regime", "scenario", "forecast", "strategy", "macro", "brain"] as const;
const OBJ: Record<string, string[]> = {
  level: ["sr_level", "reference_level"], levels: ["sr_level", "reference_level"], support: ["sr_level"], resistance: ["sr_level"],
  zone: ["fvg", "sd_zone", "range"], zones: ["fvg", "sd_zone", "range"], fvg: ["fvg"], gap: ["fvg"], gaps: ["fvg"], imbalance: ["fvg"],
  demand: ["sd_zone"], supply: ["sd_zone"], liquidity: ["liquidity_pool", "sweep"], pool: ["liquidity_pool"], pools: ["liquidity_pool"],
  sweep: ["sweep"], sweeps: ["sweep"], grab: ["sweep"], grabs: ["sweep"],
  structure: ["structure_event"], bos: ["structure_event"], choch: ["structure_event"], break: ["structure_event"], breaks: ["structure_event"],
  swing: ["swing"], swings: ["swing"], trendline: ["trendline"], trendlines: ["trendline"], trend: ["trendline"],
  range: ["range"], ranges: ["range"], impulse: ["impulse"], impulses: ["impulse"], candle: ["candle_signal"], candles: ["candle_signal"],
};
const ENG: Record<string, string> = {
  observed: "observed", regime: "regime", scenario: "scenario", scenarios: "scenario", forecast: "forecast", forecasts: "forecast",
  strategy: "strategy", signal: "strategy", signals: "strategy", trade: "strategy", trades: "strategy",
  macro: "macro", news: "macro", calendar: "macro", brain: "brain", proposal: "brain", proposals: "brain",
};
const P0_WORDS = new Set(["p0", "risk", "risks", "warning", "warnings", "invalidation", "invalidations", "invalidated", "critical"]);
const STOP = new Set(["show", "me", "the", "all", "of", "a", "an", "on", "in", "my", "what", "where", "is", "are", "and", "with", "find", "highlight", "focus", "chart", "current", "currently", "only", "any", "for", "to", "at", "please", "open", "evidence", "that", "this", "now"]);
const uniq = (xs: string[]): string[] => [...new Set(xs)].sort();

/** Rule-based, order-independent, case-insensitive. Unknown words are returned as `unmatched` — never guessed. */
export const ruleTranslator: Translator = (text) => {
  let norm = text.toLowerCase().replace(/[^a-z0-9\s]/g, " ");
  const filters: QueryFilters = {};
  const understood: string[] = [];
  const win = /\b(?:last|past)\s+(?:(\d+)\s*)?(hours?|hrs?|h|minutes?|mins?|m)\b/.exec(norm);
  if (win) {
    const n = win[1] ? Number(win[1]) : 1;
    filters.lastSec = n * (win[2]!.startsWith("h") ? 3600 : 60);
    understood.push(`last ${n} ${win[2]!.startsWith("h") ? "h" : "min"}`);
    norm = norm.replace(win[0], " ");
  }
  const types: string[] = []; const engines: string[] = []; const unmatched: string[] = [];
  for (const w of norm.split(/\s+/).filter(Boolean)) {
    if (STOP.has(w)) continue;
    if (OBJ[w]) { types.push(...OBJ[w]!); understood.push(w); }
    else if (ENG[w]) { engines.push(ENG[w]!); understood.push(w); }
    else if (P0_WORDS.has(w)) { filters.p0 = true; understood.push(w); }
    else unmatched.push(w);
  }
  if (types.length) filters.objectTypes = uniq(types);
  if (engines.length) filters.engines = uniq(engines);
  return { filters, understood: uniq(understood), unmatched: uniq(unmatched) };
};

const typesOf = (o: ComposedOverlay, byId: Map<string, AnalysisObject>): string[] =>
  o.primary.objectIds.map((id) => byId.get(id)?.type).filter((t): t is AnalysisObject["type"] => !!t);
const overlayHas = (o: ComposedOverlay, id: string): boolean => o.key === id || o.primary.mappingId === id || o.primary.objectIds.includes(id);

/** Drops anything outside the verified vocabulary / existing ids; reports what was rejected. */
export function sanitizeFilters(f: QueryFilters, ctx: QueryContext): { filters: QueryFilters; rejected: string[] } {
  const rejected: string[] = []; const out: QueryFilters = {};
  if (f.objectTypes?.length) {
    const ok = f.objectTypes.filter((t) => (OBJECT_TYPES as readonly string[]).includes(t));
    rejected.push(...f.objectTypes.filter((t) => !ok.includes(t)).map((t) => `unknown object type: ${t}`));
    if (ok.length) out.objectTypes = uniq(ok);
  }
  if (f.engines?.length) {
    const ok = f.engines.filter((e) => (ENGINES as readonly string[]).includes(e));
    rejected.push(...f.engines.filter((e) => !ok.includes(e)).map((e) => `unknown engine: ${e}`));
    if (ok.length) out.engines = uniq(ok);
  }
  if (f.p0) out.p0 = true;
  if (f.lastSec !== undefined) {
    if (Number.isFinite(f.lastSec) && f.lastSec > 0 && f.lastSec <= MAX_WINDOW_SEC) out.lastSec = f.lastSec;
    else rejected.push(`invalid time window: ${f.lastSec}`);
  }
  if (f.focusIds?.length) {
    const known = (id: string) => ctx.overlays.some((o) => overlayHas(o, id)) || ctx.items.some((i) => i.id === id);
    const ok = f.focusIds.filter(known);
    rejected.push(...f.focusIds.filter((id) => !ok.includes(id)).map((id) => `unknown reference (not a verified object): ${id}`));
    if (ok.length) out.focusIds = uniq(ok);
  }
  return { filters: out, rejected };
}

/** Rejects any proposed op that does not point at an existing, causal overlay. */
export function verifyOps(ops: readonly ChartOp[], ctx: QueryContext): { ok: ChartOp[]; rejected: string[] } {
  const keys = new Set(ctx.overlays.map((o) => o.key)); const ok: ChartOp[] = []; const rejected: string[] = [];
  for (const op of ops) {
    if (op.op === "time_range") {
      if (Number.isFinite(op.from) && Number.isFinite(op.to) && op.from <= op.to && op.to <= ctx.asOf) ok.push(op);
      else rejected.push("time range outside the knowable window");
      continue;
    }
    if (keys.has(op.key)) ok.push(op); else rejected.push(`unknown overlay: ${op.key}`);
  }
  return { ok, rejected };
}

export function runQuery(text: string, ctx: QueryContext, translate: Translator = ruleTranslator): QueryResult {
  const t = translate(text);
  const { filters, rejected } = sanitizeFilters(t.filters, ctx);
  const byId = new Map(ctx.objects.map((o) => [o.id, o]));
  const from = filters.lastSec !== undefined ? ctx.asOf - filters.lastSec : undefined;
  const hasType = !!filters.objectTypes; const hasEng = !!filters.engines; const hasId = !!filters.focusIds;
  const any = hasType || hasEng || hasId || filters.p0 !== undefined || from !== undefined;
  const overlays = !any ? [] : ctx.overlays.filter((o) => {
    if (hasEng && !hasType && !hasId) return false;
    if (hasId && !filters.focusIds!.some((id) => overlayHas(o, id))) return false;
    if (hasType && !typesOf(o, byId).some((x) => filters.objectTypes!.includes(x))) return false;
    if (filters.p0 && o.priority !== 0) return false;
    if (from !== undefined) { const r = o.primary.focusTimeRange; if (!r || r[0] > ctx.asOf || r[1] < from) return false; }
    return true;
  });
  const items = !any ? [] : ctx.items.filter((i) => {
    if (i.availableAt > ctx.asOf) return false;
    if (hasType && !hasEng && !hasId) return false;
    if (hasId && !filters.focusIds!.includes(i.id)) return false;
    if (hasEng && !filters.engines!.includes(i.engine)) return false;
    if (filters.p0 && !i.p0) return false;
    if (from !== undefined && (i.t < from || i.t > ctx.asOf)) return false;
    return true;
  });
  const proposed: ChartOp[] = overlays.flatMap((o) => [
    { op: "focus", key: o.key } as ChartOp,
    { op: "open_evidence", key: o.key, objectIds: [...o.primary.objectIds], evidenceIds: [...o.primary.evidenceIds] } as ChartOp,
  ]);
  if (from !== undefined && (overlays.length > 0 || items.length > 0)) proposed.push({ op: "time_range", from, to: ctx.asOf });
  const v = verifyOps(proposed, ctx);
  return {
    query: { text, filters, asOf: ctx.asOf, ...(overlays[0] ? { focusTarget: overlays[0].key } : {}) },
    understood: t.understood, unmatched: t.unmatched, rejected: [...rejected, ...v.rejected], ops: v.ok, overlays, items,
  };
}