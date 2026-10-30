/** DESK DK5 — reactions: a swing counts as a reaction when price departs ≥ reactAtr×ATR within reactBars
 *  bars without closing through the swing price. Known at max(swing confirmation, departure bar) close. */
import type { KernelResult } from "@/desk/kernel/kernel";
import type { Swing } from "@/desk/kernel/swings";
import { TF_SECONDS, type Timeframe } from "@/types/market";

export interface LevelsCfg {
  levels: {
    clusterAtr: number; bandCapAtr: number; reactAtr: number; reactBars: number; minGapBars: number;
    minReactions: number; minReactionsIntraday: number; strongSingleAtr: number; breakAtr: number;
    tfWeight: Record<Timeframe, number>;
  };
}

export interface Reaction {
  swing: Swing;
  side: "high" | "low";
  price: number;
  bandHi: number;
  bandLo: number;
  atr: number;
  departAtr: number;
  depIndex: number;
  knownIndex: number;
  known_at: number;
  /** Bar where departure first reached strongSingleAtr×ATR (inside the same window); -1 when it never did. */
  strongIndex: number;
}

export function findReactions(k: KernelResult, cfg: LevelsCfg): Reaction[] {
  const { reactAtr, reactBars, bandCapAtr, strongSingleAtr } = cfg.levels;
  const sec = TF_SECONDS[k.tf];
  const out: Reaction[] = [];
  for (const s of k.swingsInternal) {
    const a = k.atr[s.index];
    if (a == null || a <= 0) continue;
    const isHigh = s.kind === "high";
    const end = Math.min(k.bars.length - 1, s.index + reactBars);
    let extreme = s.price;
    let found = -1;
    let strong = -1;
    let firstDep = 0;
    for (let j = s.index + 1; j <= end; j++) {
      const b = k.bars[j]!;
      if (isHigh ? b.close > s.price : b.close < s.price) break;
      extreme = isHigh ? Math.min(extreme, b.low) : Math.max(extreme, b.high);
      const dep = Math.abs(s.price - extreme);
      if (found < 0 && dep >= reactAtr * a) { found = j; firstDep = dep; }
      if (dep >= strongSingleAtr * a) { strong = j; break; }
    }
    if (found < 0) continue;
    const bar = k.bars[s.index]!;
    const cap = bandCapAtr * a;
    const bandHi = isHigh ? s.price : Math.min(Math.min(bar.open, bar.close), s.price + cap);
    const bandLo = isHigh ? Math.max(Math.max(bar.open, bar.close), s.price - cap) : s.price;
    const knownIndex = Math.max(found, s.confirmIndex);
    out.push({
      swing: s, side: s.kind, price: s.price, bandHi: Math.max(bandHi, bandLo), bandLo: Math.min(bandHi, bandLo),
      atr: a, departAtr: firstDep / a, depIndex: found, knownIndex, strongIndex: strong < 0 ? -1 : Math.max(strong, s.confirmIndex),
      known_at: (k.bars[knownIndex]!.time) + sec,
    });
  }
  return out.sort((x, y) => x.knownIndex - y.knownIndex || x.swing.index - y.swing.index || (x.side < y.side ? -1 : 1));
}