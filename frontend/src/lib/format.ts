import { formatPips, formatPrice, toPips } from "@/lib/pips";
import { isValidTz, localTz, utcToWall } from "@/lib/tz";
import { formatInTz } from "@/lib/tz";
import type { Pair } from "@/types/market";

export type TimezoneMode = "utc" | "local" | "strategy";

/** IANA zone for the chosen mode. `strategy` falls back to UTC when no strategy zone is known. */
export function resolveTz(mode: TimezoneMode, strategyTz?: string): string {
  if (mode === "local") return localTz();
  if (mode === "strategy" && strategyTz && isValidTz(strategyTz)) return strategyTz;
  return "UTC";
}

export type TickKind = "year" | "month" | "day" | "time";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const p2 = (n: number) => String(n).padStart(2, "0");

/** Time-axis tick label in `tz`. The chart marks day/month/year ticks at UTC
 *  boundaries, so when that instant is not local midnight the clock time is shown. */
export function formatTick(utc: number, kind: TickKind, tz: string): string {
  const w = utcToWall(utc, tz);
  if (kind !== "time" && (w.hour !== 0 || w.minute !== 0)) return `${p2(w.hour)}:${p2(w.minute)}`;
  if (kind === "year") return String(w.year);
  if (kind === "month") return MONTHS[w.month - 1] ?? "";
  if (kind === "day") return String(w.day);
  return `${p2(w.hour)}:${p2(w.minute)}`;
}

/** "2026-03-08 10:00" */
export const formatCrosshairTime = (utc: number, tz: string): string => formatInTz(utc, tz);

const abbr = new Map<string, Intl.DateTimeFormat>();
/** Short zone name at that instant: "UTC", "EDT", "GMT+5:30". */
export function tzShort(utc: number, tz: string): string {
  let f = abbr.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" });
    abbr.set(tz, f);
  }
  return f.formatToParts(new Date(utc * 1000)).find((p) => p.type === "timeZoneName")?.value ?? tz;
}

export interface Change {
  pips: number;
  pct: number;
  text: string;
}
/** Close vs open: "+1.2p (+0.01%)". */
export function formatChange(open: number, close: number, pair: Pair): Change {
  const pips = toPips(close - open, pair);
  const pct = open === 0 ? 0 : ((close - open) / open) * 100;
  return { pips, pct, text: `${formatPips(pips)} (${pct > 0 ? "+" : ""}${pct.toFixed(2)}%)` };
}

export { formatPrice };
export const formatVolume = (v: number): string => Math.round(v).toLocaleString("en-US");