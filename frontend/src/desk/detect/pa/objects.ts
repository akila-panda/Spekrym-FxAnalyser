/** DESK DK11 — AnalysisObject builders for ranges, trendlines and impulses (causal; see range.ts / trendlines.ts). */
import { objectId } from "@/desk/lib/ids";
import type { KernelResult } from "@/desk/kernel/kernel";
import type { AnalysisObject, LifecycleEvent } from "@/desk/types/schemas";
import { PAIR_META, TF_SECONDS, type Candle } from "@/types/market";
import type { DetectCtx } from "../registry";
import { cfgOf, prov, r2 } from "./common";
import { findRanges } from "./range";
import { brokenAt, findTrendlines, lineAt } from "./trendlines";

export function buildRanges(k: KernelResult, ctx: DetectCtx): AnalysisObject[] {
  const cfg = cfgOf(ctx);
  const meta = PAIR_META[ctx.pair];
  const w = cfg.levels.tfWeight[ctx.tf];
  const dec = meta.decimals;
  return findRanges(k, cfg).map((r) => {
    const h = r.top - r.bot;
    const times = r.swings.map((x) => x.time);
    return {
      id: objectId({ type: "range", pair: ctx.pair, tf: ctx.tf, anchorTimes: times }),
      type: "range", layer: "priceAction", pair: ctx.pair, source_tf: ctx.tf,
      geometry: { bands: [{ pHigh: r.top, pLow: r.bot }], anchorTimes: times },
      t_event: r.last.time, known_at: r.last.known_at, confirmed_at: null, lifecycle: r.life,
      grade: {
        significance: r2(w * Math.min(1, h / (cfg.priceAction.rangeMinAtr * 2 * r.atr))), relevance: null, quality: null, freshness: null,
        factors: [
          { id: "touches", label: "2 equal swing highs and 2 equal swing lows", status: "supports", value: 4 },
          { id: "width", label: `Width ${(h / meta.pip).toFixed(1)} pips · ${(h / r.atr).toFixed(1)} ATR`, status: "supports", value: h / r.atr },
          { id: "tf", label: `${ctx.tf} timeframe weight ${w}`, status: "supports", value: w },
        ],
      },
      provenance: prov(ctx),
      evidence: [{ t: r.last.time, note: `Closes held between ${r.bot.toFixed(dec)} and ${r.top.toFixed(dec)} across 2 equal swing highs and 2 equal swing lows (${(h / meta.pip).toFixed(1)} pips wide).` }],
    };
  });
}

export function buildTrendlines(k: KernelResult, ctx: DetectCtx): AnalysisObject[] {
  const cfg = cfgOf(ctx);
  const sec = TF_SECONDS[ctx.tf];
  const meta = PAIR_META[ctx.pair];
  const w = cfg.levels.tfWeight[ctx.tf];
  const dec = meta.decimals;
  return findTrendlines(k, cfg).map((t) => {
    const times = [t.a.time, t.b.time, t.c.time];
    const support = t.side === "low";
    const br = brokenAt(t, sec, k.bars);
    const life: LifecycleEvent[] = [{ kind: "active", t: t.c.known_at, known_at: t.c.known_at }];
    if (br !== null) life.push({ kind: "broken", t: br, known_at: br, detail: { close: t.broken!.close } });
    const perBar = (t.slope * sec) / meta.pip;
    return {
      id: objectId({ type: "trendline", pair: ctx.pair, tf: ctx.tf, anchorTimes: times }),
      type: "trendline", layer: "priceAction", pair: ctx.pair, source_tf: ctx.tf, direction: support ? "bull" : "bear",
      geometry: { bands: [], points: [{ t: t.a.time, p: t.a.price }, { t: t.c.time, p: lineAt(t, t.c.time) }], anchorTimes: times },
      t_event: t.c.time, known_at: t.c.known_at, confirmed_at: null, lifecycle: life,
      grade: {
        significance: r2(w * (1 - 0.5 * Math.min(1, t.maxDev / t.tol))), relevance: null, quality: null, freshness: null,
        factors: [
          { id: "touches", label: `${t.touches} touches within ${cfg.priceAction.tlAtr} ATR`, status: "supports", value: t.touches },
          { id: "slope", label: `Slope ${perBar.toFixed(2)} pips per ${ctx.tf} bar`, status: "supports", value: perBar },
          { id: "tf", label: `${ctx.tf} timeframe weight ${w}`, status: "supports", value: w },
        ],
      },
      provenance: prov(ctx),
      evidence: [{ t: t.c.time, note: `${t.touches} swing ${support ? "lows" : "highs"} sit on one ${support ? "rising" : "falling"} line (${t.a.price.toFixed(dec)} → ${lineAt(t, t.c.time).toFixed(dec)}); no close beyond it since the first touch.` }],
    };
  });
}

/** Impulses = kernel displacements, enriched with a correction/invalidation lifecycle. Same ids as the sample detector's
 *  impulses (registered before it, so these win). correction: pullback ≥ corrAtr × ATR from the running extreme; invalidated: close beyond the origin. */
export function buildImpulses(k: KernelResult, ctx: DetectCtx): AnalysisObject[] {
  const cfg = cfgOf(ctx);
  const P = cfg.priceAction;
  const sec = TF_SECONDS[ctx.tf];
  const w = cfg.levels.tfWeight[ctx.tf];
  const bars = k.bars;
  return k.displacements.map((d) => {
    const run = bars.slice(d.startIndex, d.endIndex + 1) as Candle[];
    const bull = d.direction === "bull";
    const pHigh = Math.max(...run.map((b) => b.high));
    const pLow = Math.min(...run.map((b) => b.low));
    const origin = bull ? pLow : pHigh;
    let ext = bull ? pHigh : pLow;
    const life: LifecycleEvent[] = [{ kind: "impulse", t: d.known_at, known_at: d.known_at }];
    let corrected = false;
    for (let j = d.endIndex + 1; j < bars.length; j++) {
      const b = bars[j] as Candle;
      const t = b.time + sec;
      ext = bull ? Math.max(ext, b.high) : Math.min(ext, b.low);
      const pull = bull ? ext - b.low : b.high - ext;
      if (!corrected && pull >= P.corrAtr * d.atrAtStart) {
        corrected = true;
        life.push({ kind: "correction", t, known_at: t, detail: { atr: r2(pull / d.atrAtStart) } });
      }
      if (bull ? b.close < origin : b.close > origin) { life.push({ kind: "invalidated", t, known_at: t, detail: { close: b.close } }); break; }
    }
    return {
      id: objectId({ type: "impulse", pair: ctx.pair, tf: ctx.tf, anchorTimes: [d.startTime, d.endTime] }),
      type: "impulse", layer: "priceAction", pair: ctx.pair, source_tf: ctx.tf, direction: d.direction,
      geometry: { bands: [{ pHigh, pLow }], anchorTimes: [d.startTime, d.endTime] },
      t_event: d.startTime, known_at: d.known_at, confirmed_at: null, lifecycle: life, origin_id: d.id,
      grade: {
        significance: r2(w * Math.min(1, d.magnitudeAtr / P.fullImpulseAtr)), relevance: null, quality: null, freshness: null,
        factors: [
          { id: "magnitude", label: `Displacement ${d.magnitudeAtr.toFixed(1)} ATR`, status: "supports", value: d.magnitudeAtr },
          { id: "tf", label: `${ctx.tf} timeframe weight ${w}`, status: "supports", value: w },
        ],
      },
      provenance: prov(ctx),
      evidence: [{ t: d.endTime, note: `${run.length} same-direction bar(s) moved ${d.magnitudeAtr.toFixed(1)}× ATR.` }],
    };
  });
}