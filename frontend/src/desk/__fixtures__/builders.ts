/** DESK DK2 — compact candle builders for golden fixtures (no inline candle arrays). */
import { TF_SECONDS, type Candle, type Timeframe } from "@/types/market";

export const T0 = 1_735_689_600; // 2025-01-01T00:00Z, aligned to every TF up to D

export type Row = [open: number, high: number, low: number, close: number];

export function fromRows(tf: Timeframe, rows: readonly Row[], startIndex = 0): Candle[] {
  const sec = TF_SECONDS[tf];
  return rows.map(([open, high, low, close], i) => ({
    time: T0 + (startIndex + i) * sec, open, high, low, close, volume: 100,
  }));
}

/** Zero-body bars with a fixed range (TR == range, ATR == range). */
export const flatRows = (n: number, price: number, range: number): Row[] =>
  Array.from({ length: n }, () => [price, price + range / 2, price - range / 2, price] as Row);

/** Piecewise-linear zigzag through `waypoints`, `perLeg` bars per leg. Up bars: low == open, wick above
 *  close; down bars: high == open, wick below close → turning bars are unambiguous swings. */
export function zigzagRows(waypoints: readonly number[], perLeg: number, wick = 0.0002): Row[] {
  const rows: Row[] = [];
  for (let k = 1; k < waypoints.length; k++) {
    const a = waypoints[k - 1] as number;
    const b = waypoints[k] as number;
    for (let j = 0; j < perLeg; j++) {
      const o = a + ((b - a) * j) / perLeg;
      const c = a + ((b - a) * (j + 1)) / perLeg;
      rows.push(b >= a ? [o, c + wick, o, c] : [o, o, c - wick, c]);
    }
  }
  return rows;
}