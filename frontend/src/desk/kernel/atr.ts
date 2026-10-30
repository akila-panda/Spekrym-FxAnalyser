/** DESK DK2 — Wilder ATR. Warm-up entries are null. Causal: atr[i] depends only on bars 0..i. */
import type { Candle } from "@/types/market";

export function atr(candles: readonly Candle[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array<number | null>(candles.length).fill(null);
  if (period < 1 || candles.length < period) return out;
  let sum = 0;
  let a = 0;
  let prevClose: number | null = null;
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i] as Candle;
    const tr: number =
      prevClose === null
        ? c.high - c.low
        : Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose));
    if (i < period) {
      sum += tr;
      if (i === period - 1) {
        a = sum / period;
        out[i] = a;
      }
    } else {
      a = (a * (period - 1) + tr) / period;
      out[i] = a;
    }
    prevClose = c.close;
  }
  return out;
}