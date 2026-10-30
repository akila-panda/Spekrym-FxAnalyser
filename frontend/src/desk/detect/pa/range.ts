/** DESK DK11 — ranges (consolidation between two equal swing highs and two equal swing lows, swing scale) with breakout /
 *  failed-breakout / retest facts, plus the trend/range class helper. A range exists once its 4th swing is confirmed; band is frozen.
 *  Edges: 2 consecutive swing highs and 2 consecutive swing lows within rangeAtr × ATR, height ≥ rangeMinAtr × ATR, no close beyond
 *  an edge (± tolerance) since the first swing. A new combination at the same edges as a still-unbroken range is absorbed. */
import type { KernelResult } from "@/desk/kernel/kernel";
import type { Swing } from "@/desk/kernel/swings";
import type { DEFAULTS } from "@/desk/methodology/defaults";
import { analyzeStructure } from "@/desk/detect/structure/analyze";
import type { LifecycleEvent } from "@/desk/types/schemas";
import { TF_SECONDS, type Candle } from "@/types/market";

export interface RangeRec {
  top: number;
  bot: number;
  start: Swing;
  last: Swing;
  /** The four edge swings, by index (anchors of the id). */
  swings: Swing[];
  atr: number;
  /** Bar index of the first close beyond an edge after formation (null while intact). */
  brokenIdx: number | null;
  life: LifecycleEvent[];
}

export function findRanges(k: KernelResult, cfg: typeof DEFAULTS): RangeRec[] {
  const P = cfg.priceAction;
  const sec = TF_SECONDS[k.tf];
  const bars = k.bars;
  const out: RangeRec[] = [];
  const hs: Swing[] = [];
  const ls: Swing[] = [];
  const order = [...k.swingsSwing].sort((a, b) => a.index - b.index || (a.kind < b.kind ? -1 : 1));
  for (const s of order) {
    (s.kind === "high" ? hs : ls).push(s);
    if (hs.length < 2 || ls.length < 2) continue;
    const at = k.atr[s.confirmIndex];
    if (at == null || at <= 0) continue;
    const tol = P.rangeAtr * at;
    const [h0, h1] = [hs[hs.length - 2] as Swing, hs[hs.length - 1] as Swing];
    const [l0, l1] = [ls[ls.length - 2] as Swing, ls[ls.length - 1] as Swing];
    if (Math.abs(h0.price - h1.price) > tol || Math.abs(l0.price - l1.price) > tol) continue;
    const top = Math.max(h0.price, h1.price);
    const bot = Math.min(l0.price, l1.price);
    if (top - bot < P.rangeMinAtr * at) continue;
    const start = [h0, l0].sort((a, b) => a.index - b.index)[0] as Swing;
    if (out.some((r) => Math.abs(r.top - top) <= tol && Math.abs(r.bot - bot) <= tol && (r.brokenIdx === null || r.brokenIdx > s.confirmIndex))) continue;
    let clean = true;
    for (let i = start.index; i <= s.confirmIndex && clean; i++) {
      const c = (bars[i] as Candle).close;
      clean = c <= top + tol && c >= bot - tol;
    }
    if (!clean) continue;

    const life: LifecycleEvent[] = [{ kind: "active", t: s.known_at, known_at: s.known_at }];
    let brokenIdx: number | null = null;
    for (let j = s.confirmIndex + 1; j < bars.length; j++) {
      const b = bars[j] as Candle;
      const up = b.close > top + P.breakAtr * at;
      if (!up && !(b.close < bot - P.breakAtr * at)) continue;
      brokenIdx = j;
      const t = b.time + sec;
      life.push({ kind: "broken", t, known_at: t, detail: { dir: up ? "up" : "down", close: b.close } });
      const edge = up ? top : bot;
      let retested = false;
      for (let m = j + 1; m < bars.length && m <= j + P.failBars; m++) {
        const c = bars[m] as Candle;
        const tm = c.time + sec;
        const inside = c.close <= top && c.close >= bot;
        if (inside) { life.push({ kind: "failed_breakout", t: tm, known_at: tm }); break; }
        const touched = up ? c.low <= edge : c.high >= edge;
        if (!retested && touched) { retested = true; life.push({ kind: "retested", t: tm, known_at: tm }); }
      }
      break;
    }
    out.push({ top, bot, start, last: s, swings: [h0, h1, l0, l1].sort((a, b) => a.index - b.index), atr: at, brokenIdx, life });
  }
  return out;
}

export type MarketClass = "trend_up" | "trend_down" | "range" | "transitioning";

/** Trend/range class as of the last closed bar: an intact range wins, else the structure trend (DK4). */
export function marketClass(k: KernelResult, cfg: typeof DEFAULTS): MarketClass {
  const last = k.bars.length - 1;
  if (findRanges(k, cfg).some((r) => r.brokenIdx === null && r.last.confirmIndex <= last)) return "range";
  const t = analyzeStructure(k, cfg).trend;
  return t === "bull" ? "trend_up" : t === "bear" ? "trend_down" : "transitioning";
}