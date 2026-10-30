/** DESK DK13 — Decision Brief. Pure: (as-of folded objects, price, ATR, trends, thesis ids) → one honest state + four answers,
 *  each linking to an object. States: waiting · watching · ready (to review) · invalidated, plus "No actionable setup" and
 *  "Insufficient evidence" as first-class outcomes. Descriptive only: never says buy/sell, never forecasts.
 *  Thresholds are presentation constants here (not methodology params), so rulesVersion is unchanged. */
import { buildConfluence, type ConfluenceReport } from "@/desk/confluence/confluence";
import { buildRelations } from "@/desk/detect/relations";
import { fmtPrice, fmtTime, typeName } from "@/desk/evidence/describe";
import { levelName } from "@/desk/detect/levels/names";
import type { MarketClass } from "@/desk/detect/pa/range";
import { structureKind } from "@/desk/detect/structure/kinds";
import { lifecycleState } from "@/desk/kernel/viewAsOf";
import { distanceToObject } from "@/desk/layers/relevance";
import { DEFAULTS } from "@/desk/methodology/defaults";
import { SPENT } from "@/desk/prepare/walk";
import type { AnalysisObject, ObjectType, Relation } from "@/desk/types/schemas";
import { PAIR_META, TF_SECONDS, type Pair, type Timeframe } from "@/types/market";

export const BRIEF = {
  /** Price within this × ATR of a zone edge (or inside) counts as "at the zone". */
  touchAtr: 0.25,
  /** Within this × ATR: watching. Beyond it (up to DEFAULTS.relevanceAtr): waiting. */
  nearAtr: 1.0,
  /** Confirming facts must sit within this × ATR of the focus band. */
  confirmAtr: 1.0,
  /** Confirming facts must be known within this window before the latest closed bar. */
  recentSec: 12 * 3600,
  /** Confirmations seen before "ready to review". */
  minConfirm: 1,
} as const;

export type BriefState = "waiting" | "watching" | "ready" | "invalidated" | "none" | "insufficient";
export const STATE_LABEL: Record<BriefState, string> = {
  waiting: "Waiting", watching: "Watching", ready: "Ready to review", invalidated: "Invalidated",
  none: "No actionable setup", insufficient: "Insufficient evidence",
};
export const STATE_GLYPH: Record<BriefState, string> = { waiting: "○", watching: "◔", ready: "◉", invalidated: "✕", none: "–", insufficient: "?" };

export interface BriefAnswer { text: string; objectId?: string }
export interface Confirmation { id: string; label: string; status: "seen" | "missing" | "unavailable"; objectId?: string; known_at?: number }
export interface BriefInput {
  pair: Pair;
  /** UTC s of the latest closed bar (finite), or Infinity. */
  asOf: number;
  dataKind: "sample" | "live";
  price: number | null;
  atr: number | null;
  /** Objects already folded by viewAsOf (all TFs). */
  objects: readonly AnalysisObject[];
  trends: Partial<Record<Timeframe, MarketClass>>;
  /** Objects the trader accepted today (the thesis). Empty = no thesis. */
  acceptedIds?: ReadonlySet<string>;
}
export interface Brief {
  state: BriefState;
  label: string;
  context: BriefAnswer;
  matters: BriefAnswer;
  confirm: BriefAnswer;
  invalidate: BriefAnswer;
  confirmations: Confirmation[];
  factors: { supports: string[]; conflicts: string[]; unavailable: string[] };
  focusId: string | null;
  /** Objects the answers link to (so the evidence drawer can open them). */
  evidence: AnalysisObject[];
  relations: Relation[];
  confluence: ConfluenceReport;
  dataKind: "sample" | "live";
  asOf: number;
}

const CANDIDATE: ReadonlySet<ObjectType> = new Set<ObjectType>(["sd_zone", "fvg", "sr_level", "liquidity_pool", "range", "reference_level"]);
const TREND_TEXT: Record<MarketClass, string> = { trend_up: "trend up", trend_down: "trend down", range: "range", transitioning: "transitioning" };
const TF_ORDER: Timeframe[] = ["W", "D", "H4", "H1", "M15", "M5", "M1"];
const rank = (o: AnalysisObject): number => TF_SECONDS[o.source_tf as Timeframe];
const isRound = (o: AnalysisObject): boolean => o.type === "reference_level" && (levelName(o) ?? "").startsWith("Round ");
const alive = (o: AnalysisObject): boolean => !SPENT.has(lifecycleState(o) ?? "");

function env(o: AnalysisObject): { lo: number; hi: number } | null {
  if (o.geometry.bands.length === 0) return null;
  return { lo: Math.min(...o.geometry.bands.map((b) => b.pLow)), hi: Math.max(...o.geometry.bands.map((b) => b.pHigh)) };
}
function gap(a: AnalysisObject, b: AnalysisObject): number | null {
  const x = env(a);
  const y = env(b);
  if (!x || !y) return null;
  return Math.max(0, Math.max(x.lo, y.lo) - Math.min(x.hi, y.hi));
}
const pipsOf = (pair: Pair, d: number): string => (d / PAIR_META[pair].pip).toFixed(1);
const named = (o: AnalysisObject): string => `${o.source_tf} ${typeName(o)}`;

function trendsText(t: BriefInput["trends"]): string | null {
  const parts = TF_ORDER.filter((tf) => t[tf]).map((tf) => `${tf} ${TREND_TEXT[t[tf] as MarketClass]}`);
  return parts.length ? parts.join(" · ") : null;
}

function confirmations(f: AnalysisObject, objs: readonly AnalysisObject[], atr: number, ref: number): Confirmation[] {
  const dir = f.direction;
  const lower = (o: AnalysisObject): boolean => rank(o) < rank(f);
  const fresh = (o: AnalysisObject): boolean => o.known_at > f.known_at && o.known_at <= ref && ref - o.known_at <= BRIEF.recentSec;
  const near = (o: AnalysisObject): boolean => { const g = gap(f, o); return g !== null && g <= BRIEF.confirmAtr * atr; };
  const latest = (list: AnalysisObject[]): AnalysisObject | undefined => list.sort((a, b) => b.known_at - a.known_at || (a.id < b.id ? -1 : 1))[0];
  const mk = (id: string, label: string, hit: AnalysisObject | undefined, miss: "missing" | "unavailable" = "missing"): Confirmation =>
    hit ? { id, label, status: "seen", objectId: hit.id, known_at: hit.known_at } : { id, label, status: miss };

  const sweep = latest(objs.filter((o) => o.type === "sweep" && rank(o) <= rank(f) && fresh(o) && near(o)));
  const out: Confirmation[] = [mk("sweep", "Liquidity swept near the zone", sweep)];
  const d = dir === "bull" ? "Bullish" : "Bearish";
  const brk = latest(objs.filter((o) => { const k = structureKind(o); return (k === "BOS" || k === "CHoCH") && o.direction === dir && lower(o) && fresh(o) && near(o); }));
  const fvg = latest(objs.filter((o) => o.type === "fvg" && o.direction === dir && lower(o) && fresh(o) && near(o)));
  out.push(
    dir ? mk("break", `${d} structure break (BOS/CHoCH) on a lower timeframe`, brk) : { id: "break", label: "Structure break — direction not defined for this object", status: "unavailable" },
    dir ? mk("fvg", `${d} FVG formed on a lower timeframe`, fvg) : { id: "fvg", label: "FVG — direction not defined for this object", status: "unavailable" },
  );
  return out;
}

export function buildBrief(i: BriefInput): Brief {
  const ref = Number.isFinite(i.asOf) ? i.asOf : i.objects.reduce((m, o) => Math.max(m, o.known_at), 0);
  const base = { dataKind: i.dataKind, asOf: ref };
  const empty = (state: BriefState, why: string, extra: Partial<Brief> = {}): Brief => {
    const ctx = trendsText(i.trends);
    return {
      state, label: STATE_LABEL[state], ...base,
      context: { text: ctx ?? "Trend context unavailable." },
      matters: { text: why }, confirm: { text: "Nothing to confirm yet." }, invalidate: { text: "No invalidation level — no focus object." },
      confirmations: [], factors: { supports: [], conflicts: [], unavailable: [] }, focusId: null, evidence: [], relations: [],
      confluence: buildConfluence([], []), ...extra,
    };
  };
  const { price, atr } = i;
  if (price === null || atr === null || atr <= 0 || (i.objects.length === 0 && !trendsText(i.trends))) {
    return empty("insufficient", "No closed-bar data with a usable ATR yet — widen the data window or wait for more bars.");
  }
  const accepted = i.acceptedIds ?? new Set<string>();
  const thesis = i.objects.filter((o) => accepted.has(o.id));
  const dead = thesis.filter((o) => !alive(o));
  if (thesis.length > 0 && dead.length === thesis.length) {
    const inv = dead.filter((o) => ["invalidated", "broken"].includes(lifecycleState(o) ?? "")).sort((a, b) => b.known_at - a.known_at)[0];
    if (inv) {
      const ev = inv.lifecycle.filter((e) => e.kind === "invalidated" || e.kind === "broken").sort((a, b) => b.t - a.t)[0];
      return empty("invalidated", `Accepted object ${named(inv)} was ${lifecycleState(inv)} at ${ev ? fmtTime(ev.t) : fmtTime(inv.known_at)}.`, {
        matters: { text: `Accepted object ${named(inv)} was ${lifecycleState(inv)} at ${ev ? fmtTime(ev.t) : fmtTime(inv.known_at)}.`, objectId: inv.id },
        invalidate: { text: `Invalidated — the original thesis does not hold as recorded.`, objectId: inv.id },
        confirm: { text: "Nothing to confirm — review the idea before relying on it." }, focusId: inv.id, evidence: [inv],
      });
    }
  }

  const pool = (thesis.length > 0 ? thesis : i.objects).filter((o) => CANDIDATE.has(o.type) && alive(o) && !isRound(o));
  const scored = pool.map((o) => ({ o, d: distanceToObject(o, price) })).filter((x): x is { o: AnalysisObject; d: number } => x.d !== null && x.d <= DEFAULTS.relevanceAtr * atr)
    .sort((a, b) => a.d - b.d || (b.o.grade?.significance ?? 0) - (a.o.grade?.significance ?? 0) || rank(b.o) - rank(a.o) || (a.o.id < b.o.id ? -1 : 1));
  const top = scored[0];
  if (!top) {
    return empty(i.objects.length === 0 && !trendsText(i.trends) ? "insufficient" : "none",
      `No active level or zone within ${DEFAULTS.relevanceAtr} ATR of price${thesis.length ? " among the accepted objects" : ""}.`);
  }

  const f = top.o;
  const near = i.objects.filter((o) => CANDIDATE.has(o.type) && alive(o) && !isRound(o) && (distanceToObject(o, price) ?? Infinity) <= DEFAULTS.relevanceAtr * atr);
  const relations = buildRelations(near);
  const confluence = buildConfluence(near, relations);
  const conf = confirmations(f, i.objects, atr, ref);
  const seen = conf.filter((c) => c.status === "seen");
  const state: BriefState = top.d <= BRIEF.touchAtr * atr && seen.length >= BRIEF.minConfirm ? "ready" : top.d <= BRIEF.nearAtr * atr ? "watching" : "waiting";

  const e = env(f);
  const where = !e ? "" : top.d === 0 ? "price is inside it" : `${pipsOf(i.pair, top.d)} pips ${price < e.lo ? "above" : "below"} price`;
  const range = !e ? "" : e.hi === e.lo ? ` ${fmtPrice(i.pair, e.hi)}` : ` ${fmtPrice(i.pair, e.lo)}–${fmtPrice(i.pair, e.hi)}`;
  const area = confluence.areas.find((a) => a.memberIds.includes(f.id));
  const contra = confluence.contradictions.filter((c) => c.aId === f.id || c.bId === f.id);
  const matters = [
    `${named(f)}${range}${where ? ` · ${where}` : ""}.`,
    area ? ` Part of a multi-timeframe confluence area (${area.tfs.join(" + ")}, ${area.independent} independent).` : "",
    contra.length ? ` ${contra.length} contradicting overlapping object${contra.length === 1 ? "" : "s"}.` : "",
  ].join("");

  const first = seen[0];
  const missing = conf.filter((c) => c.status === "missing").map((c) => c.label.toLowerCase());
  const confirmText = [
    seen.length ? `Seen: ${seen.map((c) => `${c.label.toLowerCase()} (${fmtTime(c.known_at as number)})`).join("; ")}.` : "None seen yet.",
    missing.length ? ` Still missing: ${missing.join("; ")}.` : "",
  ].join("");

  let invalidate: BriefAnswer;
  if (e && f.direction) {
    const edge = f.direction === "bull" ? e.lo : e.hi;
    invalidate = { text: `Treated as invalid if a bar closes ${f.direction === "bull" ? "below" : "above"} ${fmtPrice(i.pair, edge)} (${pipsOf(i.pair, Math.abs(price - edge))} pips from price).`, objectId: f.id };
  } else {
    invalidate = { text: "No invalidation level is defined for this object type.", objectId: f.id };
  }

  const cf = confluence.byObject[f.id];
  const ctxObj = i.objects.filter((o) => ["BOS", "CHoCH"].includes(structureKind(o) ?? "")).sort((a, b) => rank(b) - rank(a) || b.known_at - a.known_at)[0];
  const link = new Set<string>([f.id, ...(first?.objectId ? [first.objectId] : []), ...conf.flatMap((c) => (c.objectId ? [c.objectId] : [])), ...(ctxObj ? [ctxObj.id] : [])]);
  const evidence = i.objects.filter((o) => link.has(o.id));
  return {
    state, label: STATE_LABEL[state], ...base,
    context: { text: trendsText(i.trends) ?? "Trend context unavailable.", objectId: ctxObj?.id },
    matters: { text: matters, objectId: f.id },
    confirm: { text: confirmText, objectId: first?.objectId },
    invalidate, confirmations: conf,
    factors: {
      supports: (cf?.supports ?? []).map((x) => x.label),
      conflicts: (cf?.opposes ?? []).map((x) => x.label),
      unavailable: (cf?.unavailable ?? []).map((x) => x.label),
    },
    focusId: f.id, evidence, relations: buildRelations(evidence), confluence,
  };
}