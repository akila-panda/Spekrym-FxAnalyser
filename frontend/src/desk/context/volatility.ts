/** DESK DK15 — ADR / volatility. Closed bars only. Distances shown in pips (ATR secondary). Pure. */
import { closedBars } from "@/desk/kernel/closedBars";
import { atr as atrOf } from "@/desk/kernel/atr";
import { bucketStart, type Candle, type Pair } from "@/types/market";
import { toPips } from "@/lib/pips";

export const ADR_PERIOD = 14;

export interface Volatility {
  adrPips: number | null;
  todayPips: number | null;
  usedPct: number | null;
  atrPips: number | null;
  atrMult: number | null;
  /** Descriptive only. */
  note: string;
}

/** `daily` = D candles, `intraday` = H1 candles. ADR = mean (high−low) of the last 14 closed D bars;
 *  today = range of closed H1 bars since the current D open; ATR = H1 Wilder 14. */
export function volatility(pair: Pair, daily: readonly Candle[], intraday: readonly Candle[], asOf: number): Volatility {
  const d = closedBars(daily, "D", asOf).slice(-ADR_PERIOD);
  const adr = d.length >= ADR_PERIOD ? d.reduce((s, c) => s + (c.high - c.low), 0) / d.length : null;
  const h1 = closedBars(intraday, "H1", asOf);
  const open = bucketStart("D", asOf);
  const today = h1.filter((c) => c.time >= open);
  const range = today.length ? Math.max(...today.map((c) => c.high)) - Math.min(...today.map((c) => c.low)) : null;
  const a = atrOf(h1, 14);
  const lastAtr = a.length ? a[a.length - 1] ?? null : null;
  const usedPct = adr && range !== null ? (range / adr) * 100 : null;
  const note = adr === null ? `Fewer than ${ADR_PERIOD} closed daily bars — ADR unavailable.` : usedPct === null ? "No closed bars yet today." : `Today's range is ${usedPct.toFixed(0)}% of the ${ADR_PERIOD}-day average range.`;
  return {
    adrPips: adr === null ? null : toPips(adr, pair),
    todayPips: range === null ? null : toPips(range, pair),
    usedPct,
    atrPips: lastAtr === null ? null : toPips(lastAtr, pair),
    atrMult: adr && lastAtr ? lastAtr / adr : null,
    note,
  };
}