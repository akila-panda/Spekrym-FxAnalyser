/** DESK DK2 — only CLOSED bars feed detectors. A bar is closed when time + TF_SECONDS[tf] <= asOf.
 *  The forming bar is excluded. Candles must be sorted ascending by time. Pure. */
import { TF_SECONDS, type Candle, type Timeframe } from "@/types/market";

export function closedBars(candles: readonly Candle[], tf: Timeframe, asOf: number): Candle[] {
  const sec = TF_SECONDS[tf];
  let lo = 0;
  let hi = candles.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((candles[mid] as Candle).time + sec <= asOf) lo = mid + 1;
    else hi = mid;
  }
  return candles.slice(0, lo);
}

/** Time (UTC s) at which bar `c` closes. */
export const barClose = (c: Candle, tf: Timeframe): number => c.time + TF_SECONDS[tf];