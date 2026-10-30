/** DESK DK15 — DST-aware trading sessions (OQ-7 default). Each session is a local wall-clock window in a city
 *  zone, chosen so that in the northern summer it equals the OQ-7 UTC defaults (Asia 00–08, London 07–16,
 *  NY 12–21 UTC). In winter London/NY shift by the real DST offset. Always "approx" until the owner confirms OQ-7.
 *  Pure; times are UTC seconds. */
import { utcToWall, wallToUtc } from "@/lib/tz";

export type SessionName = "asia" | "london" | "ny";
interface Def { name: SessionName; label: string; tz: string; startHM: [number, number]; endHM: [number, number] }

export const SESSION_DEFS: readonly Def[] = [
  { name: "asia", label: "Asia", tz: "Asia/Tokyo", startHM: [9, 0], endHM: [17, 0] },
  { name: "london", label: "London", tz: "Europe/London", startHM: [8, 0], endHM: [17, 0] },
  { name: "ny", label: "NY", tz: "America/New_York", startHM: [8, 0], endHM: [17, 0] },
];

const DAY = 86400;
const dayStart = (t: number): number => Math.floor(t / DAY) * DAY;

/** The session window whose local start falls on the UTC calendar day `dayStartUtc` (UTC seconds). */
export function sessionWindow(name: SessionName, dayStartUtc: number): { open: number; close: number } {
  const d = SESSION_DEFS.find((x) => x.name === name)!;
  const w = utcToWall(dayStartUtc + 12 * 3600, d.tz); // local date at midday is unambiguous
  const at = (hm: [number, number]) => wallToUtc({ year: w.year, month: w.month, day: w.day, hour: hm[0], minute: hm[1] }, d.tz);
  return { open: at(d.startHM), close: at(d.endHM) };
}

const offsetS = (utc: number, tz: string): number => {
  const w = utcToWall(utc, tz);
  return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second) / 1000 - utc;
};

/** Whole-hour UTC shift of a session on `dayStartUtc` relative to its northern-summer baseline (the OQ-7 default hours).
 *  0 in summer, +1 for London/NY in winter, always 0 for Asia (no DST). Used by the DK5 session-level detector. */
export function dstShiftHours(name: SessionName, dayStartUtc: number): number {
  const d = SESSION_DEFS.find((x) => x.name === name);
  if (!d) return 0;
  const year = new Date(dayStartUtc * 1000).getUTCFullYear();
  const summer = Date.UTC(year, 6, 15, 12) / 1000;
  return Math.round((offsetS(summer, d.tz) - offsetS(dayStartUtc + 12 * 3600, d.tz)) / 3600);
}

export type SessionStatus = "open" | "upcoming" | "closed";
export interface SessionRow { name: SessionName; label: string; open: number; close: number; status: SessionStatus; changeIn: number }
export interface SessionClock { now: number; rows: SessionRow[]; overlaps: string[]; approx: true }

/** Session state at `now`. `changeIn` = seconds until the next open/close of that session (always > 0). */
export function sessionClock(now: number): SessionClock {
  const today = dayStart(now);
  const rows: SessionRow[] = SESSION_DEFS.map((d) => {
    const cand = [today - DAY, today, today + DAY].map((s) => sessionWindow(d.name, s));
    const cur = cand.find((w) => now >= w.open && now < w.close);
    if (cur) return { name: d.name, label: d.label, ...cur, status: "open", changeIn: cur.close - now };
    const next = cand.find((w) => w.open > now)!;
    const prev = [...cand].reverse().find((w) => w.close <= now) ?? next;
    const soon = next.open - now <= 12 * 3600;
    return { name: d.name, label: d.label, ...(soon ? next : prev), status: soon ? "upcoming" : "closed", changeIn: next.open - now };
  });
  const open = rows.filter((r) => r.status === "open");
  const overlaps = open.length > 1 ? [open.map((r) => r.label).join(" + ") + " overlap"] : [];
  return { now, rows, overlaps, approx: true };
}

export function fmtDuration(sec: number): string {
  const m = Math.max(0, Math.round(sec / 60));
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}