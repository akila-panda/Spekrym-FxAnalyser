/** DESK DK2 — golden fixtures (H1). Deterministic; `meta` documents the expected structure. */
import type { Candle } from "@/types/market";
import { fromRows, flatRows, zigzagRows, type Row } from "./builders";

export interface Fixture { name: string; candles: Candle[]; meta: Record<string, number | number[]> }
const TF = "H1" as const;

/** HH/HL: swing highs at idx 11,35,59; swing lows at 23,47,71 (every leg 12 bars). */
export const trend: Fixture = {
  name: "trend",
  candles: fromRows(TF, zigzagRows([1.1, 1.11, 1.105, 1.115, 1.11, 1.12, 1.115, 1.125], 12)),
  meta: { highs: [11, 35, 59], lows: [23, 47, 71] },
};

/** Range: equal highs (idx 11,35,59) and equal lows (23,47). */
export const range: Fixture = {
  name: "range",
  candles: fromRows(TF, zigzagRows([1.1, 1.11, 1.1, 1.11, 1.1, 1.11, 1.1], 12)),
  meta: { highs: [11, 35, 59], lows: [23, 47] },
};

/** Equal highs (idx 11, 35) then a wick-sweep bar at idx 48 that closes back below. */
const sweepRows: Row[] = [
  ...zigzagRows([1.1, 1.11, 1.105, 1.11, 1.106], 12),
  [1.106, 1.1115, 1.1058, 1.107],
  [1.107, 1.1072, 1.1045, 1.1048],
  [1.1048, 1.105, 1.1025, 1.1028],
  [1.1028, 1.103, 1.1005, 1.1008],
];
export const sweep: Fixture = {
  name: "sweep",
  candles: fromRows(TF, sweepRows),
  meta: { equalHighs: [11, 35], sweepBar: 48 },
};

/** Bullish 3-bar FVG: middle (impulse) bar idx 20; gap = a.high 1.1004 .. c.low 1.1010. */
export const fvg: Fixture = {
  name: "fvg",
  candles: fromRows(TF, [
    ...flatRows(19, 1.1, 0.0004),
    [1.1, 1.1004, 1.0998, 1.1002],
    [1.1002, 1.103, 1.1001, 1.1028],
    [1.1028, 1.1034, 1.101, 1.1032],
    ...flatRows(5, 1.1032, 0.0004),
  ]),
  meta: { impulse: 20, gapLow: 1.1004, gapHigh: 1.101 },
};

/** Base (idx 20-22) then bullish departure from idx 23. */
export const zone: Fixture = {
  name: "zone",
  candles: fromRows(TF, [
    ...flatRows(20, 1.1, 0.0004),
    [1.1, 1.1004, 1.0999, 1.1003],
    [1.1, 1.1004, 1.0999, 1.1003],
    [1.1, 1.1004, 1.0999, 1.1003],
    [1.1003, 1.1025, 1.1002, 1.1024],
    [1.1024, 1.1046, 1.1023, 1.1045],
    [1.1045, 1.1067, 1.1044, 1.1066],
    ...flatRows(5, 1.1066, 0.0004),
  ]),
  meta: { baseStart: 20, baseEnd: 22, depart: 23 },
};

export const FIXTURES: Fixture[] = [trend, range, sweep, fvg, zone];