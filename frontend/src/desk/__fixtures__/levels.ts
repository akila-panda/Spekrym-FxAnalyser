/** DESK DK5 — level fixtures (H1). Equal turning prices → exact clusters. */
import type { Candle } from "@/types/market";
import { fromRows, flatRows, zigzagRows, type Row } from "./builders";

const mk = (w: number[], perLeg = 24, wick = 0.0002): Candle[] => fromRows("H1", zigzagRows(w, perLeg, wick));

/** 72 bars/leg, 4-pip wicks (slow enough that no reaction is a ≥3 ATR "strong single"). Support ~1.0996–1.1000 hit at idx
 *  71/215/359 (3 reactions) → broken ~idx 450 → retested from below at idx 575 (role reversal).
 *  Resistance ~1.1030–1.1034 hit at idx 143/287/431. */
export const srCycle = mk([1.103, 1.1, 1.103, 1.1, 1.103, 1.1, 1.103, 1.09, 1.0998, 1.09], 72, 0.0004);

/** One violent low: a single reaction ≥ 3 ATR (strong single). */
export const strongSingle = mk([1.1, 1.09, 1.12, 1.115]);

/** Session fixture: 48 flat H1 bars from 00:00 UTC; bar 3 spikes up (Asia high), bar 9 spikes down (London low). */
const rows: Row[] = flatRows(48, 1.1, 0.0004);
rows[3] = [1.1, 1.103, 1.0998, 1.1];
rows[9] = [1.1, 1.1002, 1.097, 1.1];
export const sessionDay: Candle[] = fromRows("H1", rows);