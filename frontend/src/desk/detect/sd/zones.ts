/** DESK DK10 — supply/demand + order-block candidates. A zone exists once its DEPARTURE is complete: ≤ dispWithinBars
 *  same-direction bars whose net move ≥ sdDispAtr × ATR (ATR of the bar before the departure). Base = up to baseBarsMax
 *  contiguous bars before it whose BODY ≤ baseAtr × ATR (zero-body bars qualify). Order block = the last opposite-colour
 *  candle right before the departure. OB and base bands overlapping > obMergeOverlap merge into one OB-tagged zone.
 *  The departure is the shortest qualifying run ending at each bar (latest start), as in the kernel. Pure and causal:
 *  nothing after the departure's last bar is read. */
import type { KernelResult } from "@/desk/kernel/kernel";
import type { DEFAULTS } from "@/desk/methodology/defaults";
import type { Candle } from "@/types/market";

export interface Band { hi: number; lo: number }
export interface ZoneCand {
  dir: "bull" | "bear";
  band: Band;
  /** Base bar range (inclusive) or null when no base qualified (OB-only zone). */
  base: { from: number; to: number } | null;
  /** Index of the order-block candle when this zone is OB-tagged. */
  ob: number | null;
  depStart: number;
  depEnd: number;
  net: number;
  atr: number;
  /** True when the departure itself left a 3-bar gap that was complete by depEnd. */
  imbalance: boolean;
  anchorIdx: number[];
}

const dirOf = (c: Candle): "bull" | "bear" | null => (c.close > c.open ? "bull" : c.close < c.open ? "bear" : null);

export function bounds(bars: readonly Candle[], rule: "body" | "wick"): Band {
  let bHi = -Infinity, bLo = Infinity, wHi = -Infinity, wLo = Infinity;
  for (const c of bars) {
    bHi = Math.max(bHi, c.open, c.close); bLo = Math.min(bLo, c.open, c.close);
    wHi = Math.max(wHi, c.high); wLo = Math.min(wLo, c.low);
  }
  return rule === "body" && bHi > bLo ? { hi: bHi, lo: bLo } : { hi: wHi, lo: wLo };
}

export function overlapFrac(a: Band, b: Band): number {
  const inter = Math.min(a.hi, b.hi) - Math.max(a.lo, b.lo);
  if (inter < 0) return 0;
  const h = Math.min(a.hi - a.lo, b.hi - b.lo);
  return h <= 0 ? 1 : inter / h;
}

export function findZones(k: KernelResult, cfg: typeof DEFAULTS): ZoneCand[] {
  const S = cfg.supplyDemand;
  const bars = k.bars;
  const out: ZoneCand[] = [];
  let j = 1;
  while (j < bars.length) {
    const cj = bars[j] as Candle;
    const dir = dirOf(cj);
    let i = -1, net = 0, at = 0;
    // shortest qualifying run ending at bar j (latest start), same-direction bars, ATR taken before the run starts
    for (let len = 1; dir && len <= S.dispWithinBars; len++) {
      const s = j - len + 1;
      if (s < 1) break;
      const first = bars[s] as Candle;
      if (dirOf(first) !== dir) break;
      const a = k.atr[s - 1];
      if (a == null || a <= 0) continue;
      const m = dir === "bull" ? cj.close - first.open : first.open - cj.close;
      if (m >= S.sdDispAtr * a) { i = s; net = m; at = a; break; }
    }
    if (i < 0 || !dir) { j++; continue; }
    const end = j;

    let n = 0;
    while (n < S.baseBarsMax && i - 1 - n >= 0) {
      const c = bars[i - 1 - n] as Candle;
      if (Math.abs(c.close - c.open) > S.baseAtr * at) break;
      n++;
    }
    const base = n >= S.baseBarsMin && n > 0 ? { from: i - n, to: i - 1 } : null;
    const prev = bars[i - 1] as Candle;
    const pd = dirOf(prev);
    const obIdx = pd && pd !== dir ? i - 1 : null;
    let imbalance = false;
    for (let m = i; m < end && !imbalance; m++) {
      const a = bars[m - 1] as Candle, c = bars[m + 1] as Candle;
      imbalance = dir === "bull" ? a.high < c.low : a.low > c.high;
    }
    const common = { dir, depStart: i, depEnd: end, net, atr: at, imbalance } as const;
    const sd = base ? bounds(bars.slice(base.from, base.to + 1), S.bounds) : null;
    const ob = obIdx !== null ? bounds([bars[obIdx] as Candle], S.bounds) : null;
    if (sd && base) {
      out.push({ ...common, band: sd, base, ob: ob && overlapFrac(ob, sd) > S.obMergeOverlap ? obIdx : null, anchorIdx: [base.from, base.to] });
    }
    if (ob && obIdx !== null && !(sd && overlapFrac(ob, sd) > S.obMergeOverlap)) {
      out.push({ ...common, band: ob, base: null, ob: obIdx, anchorIdx: [obIdx] });
    }
    j = end + 1;
  }
  return out;
}