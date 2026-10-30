/** DESK DK9 — sweep + follow-through for one pool, scanned forward from the bar after its confirmation.
 *  wick_sweep: bar trades ≥ sweepAtr × ATR beyond the pool edge and closes back inside; close_beyond: it closes beyond the edge.
 *  Follow-through facts are independent: reaction (close departs ≥ followAtr × ATR back across the edge within followBars),
 *  displacement (opposite-direction kernel displacement starting in the window), resolved (window elapsed).
 *  A pool unswept when its window ends is `superseded`. Every `known_at` = close of the bar the fact needs. */
import type { KernelResult } from "@/desk/kernel/kernel";
import type { DEFAULTS } from "@/desk/methodology/defaults";
import { TF_SECONDS, type Candle } from "@/types/market";
import type { PoolCand } from "./pools";

export interface Outcome {
  expiredAt?: number;
  sweep?: { idx: number; kind: "wick" | "close"; extreme: number; depth: number; depthAtr: number; atr: number; at: number };
  reaction?: { idx: number; at: number };
  displacement?: { id: string; magnitudeAtr: number; at: number };
  resolved?: { idx: number; at: number; reacted: boolean };
}

export function scanPool(k: KernelResult, p: PoolCand, cfg: typeof DEFAULTS, days: readonly number[]): Outcome {
  const L = cfg.liquidity;
  const sec = TF_SECONDS[k.tf];
  const s = p.side === "high" ? 1 : -1;
  const out: Outcome = {};
  const bars = k.bars;
  let j = p.s2.confirmIndex + 1;
  for (; j < bars.length; j++) {
    const b = bars[j] as Candle;
    if ((days[j] as number) - (days[p.s1.index] as number) >= L.lookbackDays) { out.expiredAt = b.time + sec; return out; }
    const at = k.atr[j];
    if (at == null || at <= 0) continue;
    const extreme = s > 0 ? b.high : b.low;
    const depth = s * (extreme - p.edge);
    if (depth < L.sweepAtr * at) continue;
    out.sweep = { idx: j, kind: s * (b.close - p.edge) > 0 ? "close" : "wick", extreme, depth, depthAtr: depth / at, atr: at, at: b.time + sec };
    break;
  }
  const sw = out.sweep;
  if (!sw) return out;
  const last = sw.idx + L.followBars;
  for (let m = sw.idx + 1; m < bars.length && m <= last; m++) {
    const b = bars[m] as Candle;
    if (s * (p.edge - b.close) >= L.followAtr * sw.atr) { out.reaction = { idx: m, at: b.time + sec }; break; }
  }
  const want = s > 0 ? "bear" : "bull";
  const d = k.displacements.find((x) => x.direction === want && x.startIndex >= sw.idx && x.startIndex <= last);
  if (d) out.displacement = { id: d.id, magnitudeAtr: d.magnitudeAtr, at: d.known_at };
  if (last < bars.length) {
    out.resolved = { idx: last, at: (bars[last] as Candle).time + sec, reacted: !!out.reaction && out.reaction.idx <= last };
  }
  return out;
}