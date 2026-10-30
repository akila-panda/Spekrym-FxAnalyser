/** DESK DK11 — trendlines from swing-scale swings. Support = rising line through swing lows, resistance = falling line through
 *  swing highs. A line exists once it has `tlMinTouches` touches (2 anchors + later swings within tlAtr × ATR, the line unbroken
 *  by swings or closes); `known_at` = that touch's confirmation. Canonical form: the two anchors are consecutive touches. Frozen
 *  at that point; later fact: `broken` (close beyond the line by the tolerance). All valid lines are emitted; "best N per TF/side"
 *  is a view-time pick (`bestTrendlines`) because a causal detector cannot rank by touches not yet known. */
import type { KernelResult } from "@/desk/kernel/kernel";
import type { Swing } from "@/desk/kernel/swings";
import { DEFAULTS } from "@/desk/methodology/defaults";
import { lifecycleState } from "@/desk/kernel/viewAsOf";
import type { AnalysisObject } from "@/desk/types/schemas";
import { TF_SECONDS, type Candle } from "@/types/market";

export interface TrendlineRec {
  side: "high" | "low";
  a: Swing;
  b: Swing;
  c: Swing;
  slope: number;
  tol: number;
  maxDev: number;
  touches: number;
  broken: { idx: number; close: number } | null;
}

export function findTrendlines(k: KernelResult, cfg: typeof DEFAULTS): TrendlineRec[] {
  const P = cfg.priceAction;
  const bars = k.bars;
  const out: TrendlineRec[] = [];
  for (const side of ["low", "high"] as const) {
    const s = side === "low" ? 1 : -1;
    const sw = k.swingsSwing.filter((x) => x.kind === side);
    for (let bi = 1; bi < sw.length; bi++) {
      const b = sw[bi] as Swing;
      const atrB = k.atr[b.confirmIndex];
      if (atrB == null || atrB <= 0) continue;
      for (let ai = Math.max(0, bi - P.tlLookbackSwings); ai < bi; ai++) {
        const a = sw[ai] as Swing;
        if (!(s * (b.price - a.price) > 0)) continue;
        const slope = (b.price - a.price) / (b.time - a.time);
        const line = (t: number): number => a.price + slope * (t - a.time);
        let ok = true;
        for (let m = ai + 1; m < bi && ok; m++) {
          const mid = sw[m] as Swing;
          const dv = s * (mid.price - line(mid.time));
          ok = dv >= -P.tlAtr * atrB && Math.abs(dv) > P.tlAtr * atrB; // not violated, and not an earlier touch
        }
        if (!ok) continue;
        let touches = 2;
        let maxDev = 0;
        let c: Swing | null = null;
        let tol = 0;
        for (let ci = bi + 1; ci < sw.length; ci++) {
          const x = sw[ci] as Swing;
          const ax = k.atr[x.confirmIndex];
          if (ax == null || ax <= 0) continue;
          const tl = P.tlAtr * ax;
          const dv = s * (x.price - line(x.time));
          if (dv < -tl) break;
          if (Math.abs(dv) <= tl) {
            touches++;
            maxDev = Math.max(maxDev, Math.abs(dv));
            if (touches >= P.tlMinTouches) { c = x; tol = tl; break; }
          }
        }
        if (!c) continue;
        let clean = true;
        for (let i = a.index; i <= c.index && clean; i++) {
          const bar = bars[i] as Candle;
          clean = s * (bar.close - line(bar.time)) >= -tol;
        }
        if (!clean) continue;
        let broken: TrendlineRec["broken"] = null;
        for (let j = c.confirmIndex + 1; j < bars.length; j++) {
          const bar = bars[j] as Candle;
          if (s * (bar.close - line(bar.time)) < -tol) { broken = { idx: j, close: bar.close }; break; }
        }
        out.push({ side, a, b, c, slope, tol, maxDev, touches, broken });
      }
    }
  }
  return out.sort((x, y) => x.c.known_at - y.c.known_at || x.a.time - y.a.time || x.b.time - y.b.time || (x.side < y.side ? -1 : 1));
}

export const lineAt = (t: TrendlineRec, time: number): number => t.a.price + t.slope * (time - t.a.time);
export const brokenAt = (t: TrendlineRec, sec: number, bars: readonly Candle[]): number | null => (t.broken ? (bars[t.broken.idx] as Candle).time + sec : null);
export const secOf = (k: Pick<KernelResult, "tf">): number => TF_SECONDS[k.tf];

/** View-time pick: the best `n` active trendlines per (source TF, direction) by significance (default `tlKeepPerTf`). */
export function bestTrendlines(objects: readonly AnalysisObject[], n: number = DEFAULTS.priceAction.tlKeepPerTf): AnalysisObject[] {
  const groups = new Map<string, AnalysisObject[]>();
  for (const o of objects) {
    if (o.type !== "trendline" || lifecycleState(o) === "broken") continue;
    const key = `${o.source_tf}:${o.direction ?? ""}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(o);
  }
  const rank = (a: AnalysisObject, b: AnalysisObject): number =>
    (b.grade?.significance ?? 0) - (a.grade?.significance ?? 0) || b.known_at - a.known_at || (a.id < b.id ? -1 : 1);
  return [...groups.values()].flatMap((g) => g.sort(rank).slice(0, Math.max(0, n)));
}