/** DST-safe wall-clock <-> UTC conversion using Intl only (no date library). */

export interface WallTime {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second?: number;
}

const cache = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
  let f = cache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    cache.set(tz, f);
  }
  return f;
}

export function isValidTz(tz: string): boolean {
  try {
    formatter(tz);
    return true;
  } catch {
    return false;
  }
}

export function localTz(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** UTC seconds -> wall clock in `tz`. */
export function utcToWall(utc: number, tz: string): Required<WallTime> {
  const out: Record<string, number> = {};
  for (const p of formatter(tz).formatToParts(new Date(utc * 1000))) {
    if (p.type !== "literal") out[p.type] = Number(p.value);
  }
  return {
    year: out.year ?? NaN,
    month: out.month ?? NaN,
    day: out.day ?? NaN,
    hour: out.hour ?? NaN,
    minute: out.minute ?? NaN,
    second: out.second ?? NaN,
  };
}

function wallAsUtcSeconds(w: WallTime): number {
  return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second ?? 0) / 1000;
}

function offsetSeconds(utc: number, tz: string): number {
  return wallAsUtcSeconds(utcToWall(utc, tz)) - utc;
}

function sameWall(a: WallTime, b: WallTime): boolean {
  return (
    a.year === b.year && a.month === b.month && a.day === b.day &&
    a.hour === b.hour && a.minute === b.minute && (a.second ?? 0) === (b.second ?? 0)
  );
}

/** Wall clock in `tz` -> UTC seconds.
 *  Spring-forward gap (time does not exist): resolves to the instant after the gap.
 *  Fall-back overlap (time occurs twice): resolves to the first occurrence. */
export function wallToUtc(w: WallTime, tz: string): number {
  const guess = wallAsUtcSeconds(w);
  const off1 = offsetSeconds(guess, tz);
  const c1 = guess - off1;
  const off2 = offsetSeconds(c1, tz);
  if (off2 === off1) return c1;
  const c2 = guess - off2;
  return sameWall(utcToWall(c2, tz), w) ? c2 : c1;
}

export function parseHM(hm: string): { hour: number; minute: number } {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hm);
  if (!m) throw new Error(`Invalid HH:MM time: "${hm}"`);
  return { hour: Number(m[1]), minute: Number(m[2]) };
}

function parseDate(date: string): { year: number; month: number; day: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw new Error(`Invalid date: "${date}"`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

/** "The 10:00 to 11:00 New York window on this date" -> UTC seconds.
 *  If `endHM` is not after `startHM` the window ends on the next calendar day. */
export function windowOnDate(
  date: string,
  startHM: string,
  endHM: string,
  tz: string,
): { start: number; end: number } {
  const d = parseDate(date);
  const s = parseHM(startHM);
  const e = parseHM(endHM);
  const nextDay = e.hour * 60 + e.minute <= s.hour * 60 + s.minute;
  const endDate = new Date(Date.UTC(d.year, d.month - 1, d.day + (nextDay ? 1 : 0)));
  return {
    start: wallToUtc({ ...d, hour: s.hour, minute: s.minute }, tz),
    end: wallToUtc(
      {
        year: endDate.getUTCFullYear(),
        month: endDate.getUTCMonth() + 1,
        day: endDate.getUTCDate(),
        hour: e.hour,
        minute: e.minute,
      },
      tz,
    ),
  };
}

/** "2026-03-08 10:00" in `tz`. */
export function formatInTz(utc: number, tz: string, withSeconds = false): string {
  const w = utcToWall(utc, tz);
  const p = (n: number) => String(n).padStart(2, "0");
  const base = `${w.year}-${p(w.month)}-${p(w.day)} ${p(w.hour)}:${p(w.minute)}`;
  return withSeconds ? `${base}:${p(w.second)}` : base;
}