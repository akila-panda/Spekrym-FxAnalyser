/** DESK DK4 — structure fixtures (H1, 24 bars/leg → swing-scale N=9). Turning points at idx 24k-1. */
import type { Candle } from "@/types/market";
import { fromRows, zigzagRows } from "./builders";

const mk = (w: number[]): Candle[] => fromRows("H1", zigzagRows(w, 24));

/** HH/HL staircase: BOS up at the break of the prior high once the HL is confirmed. */
export const bosBull = mk([1.1, 1.11, 1.104, 1.114, 1.108, 1.117, 1.111, 1.12]);
/** Bull trend, protected low broken by a close, new LL then LH confirm the change. */
export const chochBear = mk([1.1, 1.11, 1.104, 1.114, 1.108, 1.117, 1.1, 1.11, 1.103]);
/** Same break, but price rallies back through the pre-CHoCH high ⇒ the CHoCH fails. */
export const chochFailed = mk([1.1, 1.11, 1.104, 1.114, 1.108, 1.117, 1.106, 1.12, 1.112]);