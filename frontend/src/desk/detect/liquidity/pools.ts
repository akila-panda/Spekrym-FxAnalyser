/** DESK DK9 — equal highs/lows pools from the internal swing scale. A pool exists once its 2nd equal swing is confirmed
 *  (known_at = that swing's confirmation bar close), so pools exist before any sweep. Frozen at formation; a later equal
 *  swing at the same level is absorbed (no duplicate pool). Window = `lookbackDays` trading days (UTC dates that have bars). */
import type { KernelResult } from "@/desk/kernel/kernel";
import type { Swing } from "@/desk/kernel/swings";
import type { DEFAULTS } from "@/desk/methodology/defaults";
import type { Candle } from "@/types/market";

export type Side = "high" | "low";
export interface PoolCand {
  side: Side;
  s1: Swing;
  s2: Swing;
  /** Band of the two equal swings; `edge` is the side a sweep must pass (high → hi, low → lo). */
  hi: number;
  lo: number;
  edge: number;
  tol: number;
}

/** Trading-day number per bar: increments when the UTC date changes between consecutive bars (weekends have no bars). */
export function tradingDays(bars: readonly Candle[]): number[] {
  const out: number[] = [];
  let n = 0;
  let prev = -1;
  for (const b of bars) {
    const d = Math.floor(b.time / 86_400);
    if (d !== prev) { n++; prev = d; }
    out.push(n);
  }
  return out;
}

/** True when no bar strictly between the swings traded through the level by more than `tol` on the pool side. */
function clean(bars: readonly Candle[], side: Side, from: number, to: number, level: number, tol: number): boolean {
  for (let i = from + 1; i < to; i++) {
    const b = bars[i] as Candle;
    if (side === "high" ? b.high > level + tol : b.low < level - tol) return false;
  }
  return true;
}

export function findPools(k: KernelResult, cfg: typeof DEFAULTS, days: readonly number[]): PoolCand[] {
  const L = cfg.liquidity;
  const out: PoolCand[] = [];
  for (const side of ["high", "low"] as const) {
    const sw = k.swingsInternal
      .filter((s) => s.kind === side)
      .sort((a, b) => a.confirmIndex - b.confirmIndex || a.index - b.index);
    const open: Swing[] = [];
    const formed: PoolCand[] = [];
    for (const s of sw) {
      const at = k.atr[s.confirmIndex];
      if (at == null || at <= 0) continue;
      const tol = L.eqAtr * at;
      while (open.length && (days[s.index] as number) - (days[(open[0] as Swing).index] as number) >= L.lookbackDays) open.shift();
      const near = (price: number): boolean => Math.abs(price - s.price) <= tol;
      // absorbed by an existing pool at the same level (3rd+ equal swing)
      const absorbed = formed.some((p) =>
        (days[s.index] as number) - (days[p.s1.index] as number) < L.lookbackDays && near(p.edge) &&
        clean(k.bars, side, p.s2.index, s.index, p.edge, tol));
      if (absorbed) continue;
      let hit = -1;
      for (let q = open.length - 1; q >= 0; q--) {
        const p = open[q] as Swing;
        const top = side === "high" ? Math.max(p.price, s.price) : Math.min(p.price, s.price);
        if (near(p.price) && clean(k.bars, side, p.index, s.index, top, tol)) { hit = q; break; }
      }
      if (hit < 0) { open.push(s); continue; }
      const p = open.splice(hit, 1)[0] as Swing;
      const hi = Math.max(p.price, s.price);
      const lo = Math.min(p.price, s.price);
      const pool: PoolCand = { side, s1: p, s2: s, hi, lo, edge: side === "high" ? hi : lo, tol };
      formed.push(pool);
      out.push(pool);
    }
  }
  return out.sort((a, b) => a.s2.known_at - b.s2.known_at || a.s1.time - b.s1.time || (a.side < b.side ? -1 : 1));
}