/** DESK DK9 — liquidity pools (equal highs/lows, "potential") + sweeps with independent follow-through facts.
 *  Pool lifecycle: potential → swept → reaction_observed → resolved, or potential → superseded (window ended unswept).
 *  Direction = side of the price pool: bear = equal highs (above), bull = equal lows (below). Causal; see pools.ts / sweeps.ts. */
import { objectId } from "@/desk/lib/ids";
import { DEFAULTS } from "@/desk/methodology/defaults";
import type { AnalysisObject, LifecycleEvent } from "@/desk/types/schemas";
import { PAIR_META } from "@/types/market";
import type { Detector } from "../registry";
import { findPools, tradingDays } from "./pools";
import { scanPool } from "./sweeps";

const r2 = (n: number): number => Math.round(n * 100) / 100;
const byTime = (a: LifecycleEvent, b: LifecycleEvent): number => a.known_at - b.known_at;

export const liquidityDetector: Detector = {
  id: "liquidity",
  version: 1,
  run(k, ctx) {
    const cfg = ctx.cfg ?? DEFAULTS;
    const L = cfg.liquidity;
    const meta = PAIR_META[ctx.pair];
    const w = cfg.levels.tfWeight[ctx.tf];
    const dec = meta.decimals;
    const days = tradingDays(k.bars);
    const provenance = { rulesVersion: ctx.rulesVersion, dataKind: ctx.dataKind, detector: "liquidity", detectorVersion: 1 };
    const out: AnalysisObject[] = [];
    for (const p of findPools(k, cfg, days)) {
      const high = p.side === "high";
      const dir = high ? ("bear" as const) : ("bull" as const);
      const name = high ? "highs" : "lows";
      const spread = p.hi - p.lo;
      const at = k.atr[p.s2.confirmIndex] as number;
      const poolId = objectId({ type: "liquidity_pool", pair: ctx.pair, tf: ctx.tf, anchorTimes: [p.s1.time, p.s2.time] });
      const o = scanPool(k, p, cfg, days);
      const life: LifecycleEvent[] = [{ kind: "potential", t: p.s2.known_at, known_at: p.s2.known_at }];
      if (o.sweep) life.push({ kind: "swept", t: o.sweep.at, known_at: o.sweep.at, detail: { sweep: o.sweep.kind, depthPips: r2(o.sweep.depth / meta.pip) } });
      if (o.reaction) life.push({ kind: "reaction_observed", t: o.reaction.at, known_at: o.reaction.at });
      if (o.resolved) life.push({ kind: "resolved", t: o.resolved.at, known_at: o.resolved.at, detail: { reacted: o.resolved.reacted ? 1 : 0 } });
      if (o.expiredAt !== undefined) life.push({ kind: "superseded", t: o.expiredAt, known_at: o.expiredAt, detail: { reason: "window" } });
      out.push({
        id: poolId, type: "liquidity_pool", layer: "liquidity", pair: ctx.pair, source_tf: ctx.tf, direction: dir,
        geometry: { bands: [{ pHigh: p.hi, pLow: p.lo }], points: [{ t: p.s1.time, p: p.s1.price }, { t: p.s2.time, p: p.s2.price }], anchorTimes: [p.s1.time, p.s2.time] },
        t_event: p.s2.time, known_at: p.s2.known_at, confirmed_at: null, lifecycle: life.sort(byTime),
        grade: {
          significance: r2(w * (1 - 0.5 * Math.min(1, spread / p.tol))), relevance: null, quality: null, freshness: null,
          factors: [
            { id: "touches", label: `2 equal ${name}`, status: "supports", value: 2 },
            { id: "spread", label: `Spread ${(spread / meta.pip).toFixed(1)} pips · ${(spread / at).toFixed(2)} ATR`, status: "supports", value: spread / at },
            { id: "window", label: `Within ${L.lookbackDays} trading days`, status: "supports", value: L.lookbackDays },
            { id: "tf", label: `${ctx.tf} timeframe weight ${w}`, status: "supports", value: w },
          ],
        },
        provenance,
        evidence: [{ t: p.s2.time, note: `Equal ${name} at ${p.s1.price.toFixed(dec)} and ${p.s2.price.toFixed(dec)} (${(spread / meta.pip).toFixed(1)} pips apart) — a potential liquidity pool.` }],
      });
      const sw = o.sweep;
      if (!sw) continue;
      const bar = k.bars[sw.idx]!;
      const sl: LifecycleEvent[] = [{ kind: "observed", t: sw.at, known_at: sw.at }];
      if (o.reaction) sl.push({ kind: "reaction_observed", t: o.reaction.at, known_at: o.reaction.at });
      if (o.displacement) sl.push({ kind: "displacement_followed", t: o.displacement.at, known_at: o.displacement.at, detail: { atr: r2(o.displacement.magnitudeAtr) } });
      if (o.resolved) sl.push({ kind: "resolved", t: o.resolved.at, known_at: o.resolved.at, detail: { reacted: o.resolved.reacted ? 1 : 0 } });
      const close = sw.kind === "close";
      out.push({
        id: objectId({ type: "sweep", pair: ctx.pair, tf: ctx.tf, anchorTimes: [bar.time, p.s1.time, p.s2.time] }),
        type: "sweep", layer: "liquidity", pair: ctx.pair, source_tf: ctx.tf, direction: dir,
        geometry: { bands: [{ pHigh: high ? sw.extreme : p.edge, pLow: high ? p.edge : sw.extreme }], points: [{ t: bar.time, p: sw.extreme }], anchorTimes: [bar.time, p.s1.time, p.s2.time] },
        t_event: bar.time, known_at: sw.at, confirmed_at: null, lifecycle: sl.sort(byTime),
        grade: {
          significance: r2(w * Math.min(1, sw.depthAtr / L.fullDepthAtr)), relevance: null, quality: null, freshness: null,
          factors: [
            { id: close ? "close_beyond" : "wick_sweep", label: close ? "Closed beyond the pool" : "Wick beyond the pool, closed back inside", status: "supports" },
            { id: "depth", label: `Beyond by ${(sw.depth / meta.pip).toFixed(1)} pips · ${sw.depthAtr.toFixed(1)} ATR`, status: "supports", value: sw.depthAtr },
            { id: "tf", label: `${ctx.tf} timeframe weight ${w}`, status: "supports", value: w },
          ],
        },
        provenance,
        evidence: [
          { t: bar.time, objectId: poolId, note: `Price traded ${(sw.depth / meta.pip).toFixed(1)} pips ${high ? "above" : "below"} equal ${name} (${p.edge.toFixed(dec)}) and ${close ? `closed ${high ? "above" : "below"} it` : "closed back inside"}.` },
        ],
      });
    }
    return out;
  },
};