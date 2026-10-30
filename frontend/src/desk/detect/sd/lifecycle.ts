/** DESK DK10 — zone lifecycle, scanned from the bar after the departure. Demand is the base case; supply is mirrored
 *  (prices negated). fresh → partially_mitigated (wick enters the proximal edge) → fully_mitigated (wick reaches the midpoint)
 *  → invalidated (close beyond the distal edge, terminal). Each fact is known at the close of its bar; they may share a bar. */
import type { LifecycleEvent } from "@/desk/types/schemas";
import type { Candle } from "@/types/market";
import type { Band } from "./zones";

export function zoneLifecycle(bars: readonly Candle[], from: number, dir: "bull" | "bear", band: Band, sec: number): LifecycleEvent[] {
  const s = dir === "bull" ? 1 : -1;
  const lo = s > 0 ? band.lo : -band.hi;
  const hi = s > 0 ? band.hi : -band.lo;
  const mid = (lo + hi) / 2;
  const life: LifecycleEvent[] = [];
  let entered = false, full = false;
  for (let j = from; j < bars.length; j++) {
    const b = bars[j] as Candle;
    const low = s > 0 ? b.low : -b.high;
    const t = b.time + sec;
    const ev = (kind: string, detail?: Record<string, number>): void => { life.push({ kind, t, known_at: t, ...(detail ? { detail } : {}) }); };
    if (!entered && low <= hi) {
      entered = true;
      ev("partially_mitigated", { depth: Math.round(Math.min(1, (hi - Math.max(low, lo)) / (hi - lo)) * 100) / 100 });
    }
    if (!full && low <= mid) { full = true; ev("fully_mitigated"); }
    if (s * b.close < lo) { ev("invalidated", { close: b.close }); return life; }
  }
  return life;
}