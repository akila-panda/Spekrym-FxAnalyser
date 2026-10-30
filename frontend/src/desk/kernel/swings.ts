/** DESK DK2 — one causal fractal swing engine. Swing high at i: high[i] > highs of N bars before and
 *  >= highs of N bars after (first of equal highs wins). Confirmed at bar i+N close (known_at). */
import { TF_SECONDS, type Candle, type Timeframe } from "@/types/market";

export type SwingKind = "high" | "low";
export interface Swing {
  index: number;
  time: number;
  price: number;
  kind: SwingKind;
  n: number;
  confirmIndex: number;
  known_at: number;
}

export function findSwings(candles: readonly Candle[], tf: Timeframe, n: number): Swing[] {
  const out: Swing[] = [];
  const len = candles.length;
  if (n < 1) return out;
  const sec = TF_SECONDS[tf];
  for (let i = n; i < len - n; i++) {
    const c = candles[i] as Candle;
    let isHigh = true;
    let isLow = true;
    for (let k = 1; k <= n && (isHigh || isLow); k++) {
      const l = candles[i - k] as Candle;
      const r = candles[i + k] as Candle;
      if (!(c.high > l.high) || !(c.high >= r.high)) isHigh = false;
      if (!(c.low < l.low) || !(c.low <= r.low)) isLow = false;
    }
    const confirm = candles[i + n] as Candle;
    const base = { index: i, time: c.time, n, confirmIndex: i + n, known_at: confirm.time + sec };
    if (isHigh) out.push({ ...base, price: c.high, kind: "high" });
    if (isLow) out.push({ ...base, price: c.low, kind: "low" });
  }
  return out;
}

export interface SwingScales {
  internal: Swing[];
  swing: Swing[];
}

/** Two scales: internal (N) and swing (N × mult). */
export function swingScales(candles: readonly Candle[], tf: Timeframe, n: number, mult: number): SwingScales {
  return { internal: findSwings(candles, tf, n), swing: findSwings(candles, tf, n * mult) };
}