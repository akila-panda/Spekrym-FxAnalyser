/** The only place backend timestamps are parsed. Safari cannot parse
 *  "2025-05-07 17:00:00+00:00" (space separator), so this is hand-rolled. */

export type UtcSeconds = number;

const TS_RE =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}(?::?\d{2})?)?$/;

/** Parse "2025-05-07 17:00:00+00:00", "2025-05-07T17:00:00Z", or a naive string
 *  (treated as UTC). Fractional seconds are dropped. Throws on anything else. */
export function parseBackendTs(input: string): UtcSeconds {
  const m = TS_RE.exec(input.trim());
  if (!m) throw new Error(`Invalid backend timestamp: "${input}"`);
  const [y, mo, d, h, mi, s] = [m[1], m[2], m[3], m[4], m[5], m[6]].map(Number) as [
    number, number, number, number, number, number,
  ];
  const ms = Date.UTC(y, mo - 1, d, h, mi, s);
  const chk = new Date(ms);
  if (
    chk.getUTCFullYear() !== y || chk.getUTCMonth() !== mo - 1 || chk.getUTCDate() !== d ||
    chk.getUTCHours() !== h || chk.getUTCMinutes() !== mi || chk.getUTCSeconds() !== s
  ) {
    throw new Error(`Invalid backend timestamp: "${input}"`);
  }
  let offset = 0;
  const off = m[7];
  if (off && off !== "Z") {
    const sign = off.startsWith("-") ? -1 : 1;
    const digits = off.slice(1).replace(":", "");
    const oh = Number(digits.slice(0, 2));
    const om = Number(digits.slice(2) || "0");
    offset = sign * (oh * 3600 + om * 60);
  }
  return ms / 1000 - offset;
}

/** "2025-05-07T17:00:00Z" */
export function toIsoUtc(sec: UtcSeconds): string {
  return new Date(sec * 1000).toISOString().replace(".000Z", "Z");
}

/** "2025-05-07" (UTC date). */
export function utcDateString(sec: UtcSeconds): string {
  return new Date(sec * 1000).toISOString().slice(0, 10);
}

export function floorTo(sec: UtcSeconds, step: number): UtcSeconds {
  return Math.floor(sec / step) * step;
}