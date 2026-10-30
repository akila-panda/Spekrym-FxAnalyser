/** DESK DK11 — candle signals (engulfing, pin bar) ONLY within location: the signal's tip (low for bullish, high for bearish)
 *  is within locAtr × ATR of a prior level / zone / pool / FVG that was already known and not spent at the signal bar's close.
 *  Needs `prior` objects (registered-earlier detectors). Causal: prior objects are read as of the signal's close. */
import { typeName } from "@/desk/evidence/describe";
import { objectId } from "@/desk/lib/ids";
import type { KernelResult } from "@/desk/kernel/kernel";
import type { AnalysisObject } from "@/desk/types/schemas";
import { PAIR_META, TF_SECONDS, type Candle } from "@/types/market";
import type { DetectCtx } from "../registry";
import { cfgOf, dirOf, prov, r2 } from "./common";

const LOC = new Set(["sr_level", "reference_level", "fvg", "liquidity_pool", "sd_zone"]);
const SPENT = new Set(["fully_mitigated", "invalidated", "filled", "broken", "inverted", "resolved", "superseded"]);

/** Not spent as of `t` (only lifecycle events already known at `t` count). */
function activeAt(o: AnalysisObject, t: number): boolean {
  let last: { kind: string; t: number } | null = null;
  for (const e of o.lifecycle) if (e.known_at <= t && (!last || e.t >= last.t)) last = e;
  return !(last && SPENT.has(last.kind));
}
const gap = (o: AnalysisObject, p: number): number => {
  let g = Infinity;
  for (const b of o.geometry.bands) g = Math.min(g, p > b.pHigh ? p - b.pHigh : p < b.pLow ? b.pLow - p : 0);
  return g;
};

export function buildSignals(k: KernelResult, ctx: DetectCtx, prior: readonly AnalysisObject[]): AnalysisObject[] {
  const cfg = cfgOf(ctx);
  const P = cfg.priceAction;
  const sec = TF_SECONDS[ctx.tf];
  const meta = PAIR_META[ctx.pair];
  const w = cfg.levels.tfWeight[ctx.tf];
  const anchors = prior.filter((o) => LOC.has(o.type) && o.geometry.bands.length > 0);
  const out: AnalysisObject[] = [];
  if (anchors.length === 0) return out;
  const bars = k.bars;
  for (let i = 1; i < bars.length; i++) {
    const a = k.atr[i];
    if (a == null || a <= 0) continue;
    const c = bars[i] as Candle;
    const p = bars[i - 1] as Candle;
    const range = c.high - c.low;
    if (range < P.signalMinRangeAtr * a) continue;
    const cd = dirOf(c);
    const pd = dirOf(p);
    const upper = c.high - Math.max(c.open, c.close);
    const lower = Math.min(c.open, c.close) - c.low;
    let dir: "bull" | "bear" | null = null;
    let name = "";
    if (cd && pd && cd !== pd && (cd === "bull" ? c.close >= p.open && c.open <= p.close : c.close <= p.open && c.open >= p.close)) {
      dir = cd; name = `${cd === "bull" ? "Bullish" : "Bearish"} engulfing`;
    } else if (lower >= P.pinWickFrac * range) { dir = "bull"; name = "Bullish pin bar"; }
    else if (upper >= P.pinWickFrac * range) { dir = "bear"; name = "Bearish pin bar"; }
    if (!dir) continue;
    const known = c.time + sec;
    const tip = dir === "bull" ? c.low : c.high;
    let best: AnalysisObject | null = null;
    let bd = P.locAtr * a;
    for (const o of anchors) {
      const d = gap(o, tip); // cheap price test first; lifecycle only for the few candidates in reach
      if (d > bd || (best && d === bd) || o.known_at > known || !activeAt(o, known)) continue;
      bd = d; best = o;
    }
    if (!best) continue;
    out.push({
      id: objectId({ type: "candle_signal", pair: ctx.pair, tf: ctx.tf, anchorTimes: [c.time] }),
      type: "candle_signal", layer: "priceAction", pair: ctx.pair, source_tf: ctx.tf, direction: dir,
      geometry: { bands: [{ pHigh: c.high, pLow: c.low }], points: [{ t: c.time, p: tip }], anchorTimes: [c.time] },
      t_event: c.time, known_at: known, confirmed_at: null, lifecycle: [],
      grade: {
        significance: r2(w * (1 - 0.5 * Math.min(1, bd / (P.locAtr * a)))), relevance: null, quality: null, freshness: null,
        factors: [
          { id: "pattern", label: name, status: "supports" },
          { id: "location", label: `${(bd / meta.pip).toFixed(1)} pips · ${(bd / a).toFixed(1)} ATR from ${best.source_tf} ${typeName(best)}`, status: "supports", value: bd / a },
          { id: "tf", label: `${ctx.tf} timeframe weight ${w}`, status: "supports", value: w },
        ],
      },
      provenance: prov(ctx),
      evidence: [{ t: c.time, objectId: best.id, note: `${name} at ${tip.toFixed(meta.decimals)}, within ${P.locAtr} ATR of a known ${typeName(best).toLowerCase()}.` }],
    });
  }
  return out;
}