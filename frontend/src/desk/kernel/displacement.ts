/** DESK DK2 — displacement: a run of <= maxBars same-direction bars whose net move >= dispAtr × ATR
 *  (ATR taken before the run starts). Shortest qualifying run ending at each bar; later bars of the same
 *  impulse (within maxBars of its start) are absorbed, not re-reported. Causal. `id` doubles as origin_id. */
import { TF_SECONDS, type Candle, type Pair, type Timeframe } from "@/types/market";

export interface Displacement {
  id: string;
  direction: "bull" | "bear";
  startIndex: number;
  endIndex: number;
  startTime: number;
  endTime: number;
  atrAtStart: number;
  magnitudeAtr: number;
  known_at: number;
}

const dirOf = (c: Candle): "bull" | "bear" | null =>
  c.close > c.open ? "bull" : c.close < c.open ? "bear" : null;

export function findDisplacements(
  candles: readonly Candle[],
  atrs: readonly (number | null)[],
  ctx: { pair: Pair; tf: Timeframe },
  dispAtr: number,
  maxBars: number,
): Displacement[] {
  const out: Displacement[] = [];
  const sec = TF_SECONDS[ctx.tf];
  let blockEnd = -1;
  let absorbing = false;
  let absorbDir: "bull" | "bear" | null = null;
  let absorbLimit = -1;
  for (let j = 1; j < candles.length; j++) {
    if (j <= blockEnd) continue;
    const cj = candles[j] as Candle;
    const dj = dirOf(cj);
    if (absorbing && j === blockEnd + 1 && j <= absorbLimit && dj === absorbDir) {
      blockEnd = j;
      continue;
    }
    absorbing = false;
    if (!dj) continue;
    for (let len = 1; len <= maxBars; len++) {
      const s = j - len + 1;
      if (s < 1 || s <= blockEnd) break;
      const first = candles[s] as Candle;
      if (dirOf(first) !== dj) break;
      const a = atrs[s - 1];
      if (a == null || a <= 0) continue;
      const net = dj === "bull" ? cj.close - first.open : first.open - cj.close;
      if (net >= dispAtr * a) {
        out.push({
          id: `disp:${ctx.pair}:${ctx.tf}:${first.time}`,
          direction: dj,
          startIndex: s,
          endIndex: j,
          startTime: first.time,
          endTime: cj.time,
          atrAtStart: a,
          magnitudeAtr: net / a,
          known_at: cj.time + sec,
        });
        blockEnd = j;
        absorbing = true;
        absorbDir = dj;
        absorbLimit = s + maxBars - 1;
        break;
      }
    }
  }
  return out;
}