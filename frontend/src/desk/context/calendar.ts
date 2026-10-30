/** DESK DK15 — economic-calendar view and the high-impact-soon warning. Pure.
 *  Honesty: an event's `actual` is hidden until its time has passed relative to the as-of clock. */
import type { DeskEvent } from "@/desk/source/deskSource";
import { PAIR_META, type Pair } from "@/types/market";

export const CAL = { soonSec: 30 * 60, pastSec: 2 * 3600, aheadSec: 24 * 3600 } as const;

export interface CalRow extends DeskEvent { state: "upcoming" | "released"; inSec: number; relevant: boolean }

const ccys = (pair: Pair): string[] => [PAIR_META[pair].base, PAIR_META[pair].quote];

/** Events from `now − 2 h` to `now + 24 h`, soonest first; currencies of the pair flagged `relevant`. */
export function calendarView(events: readonly DeskEvent[], now: number, pair: Pair): CalRow[] {
  const mine = ccys(pair);
  return events
    .filter((e) => e.time >= now - CAL.pastSec && e.time <= now + CAL.aheadSec)
    .map((e): CalRow => {
      const released = e.time <= now;
      const { actual: _a, ...rest } = e;
      return { ...(released ? e : rest), state: released ? "released" : "upcoming", inSec: e.time - now, relevant: mine.includes(e.currency) };
    })
    .sort((a, b) => a.time - b.time || a.id.localeCompare(b.id));
}

/** Pinned warning: a high-impact event for the pair's currencies inside the next `soonSec` (or just released inside it). */
export function highImpactSoon(events: readonly DeskEvent[], now: number, pair: Pair, soonSec: number = CAL.soonSec): DeskEvent | null {
  const mine = ccys(pair);
  const hit = events
    .filter((e) => e.impact === "high" && mine.includes(e.currency) && Math.abs(e.time - now) < soonSec && e.time >= now - soonSec)
    .sort((a, b) => a.time - b.time);
  return hit[0] ?? null;
}

export const impactGlyph = (i: DeskEvent["impact"]): string => (i === "high" ? "▲▲▲" : i === "med" ? "▲▲" : "▲");