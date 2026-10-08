/** Scan range: UTC calendar dates (YYYY-MM-DD), both ends inclusive. */
export interface DateRange {
  from: string;
  to: string;
}
export interface DataBounds {
  first: number | null;
  last: number | null;
}

export const RANGE_PRESETS = [5, 20, 60] as const;
const DAY = 86400;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const toDateString = (sec: number): string => new Date(sec * 1000).toISOString().slice(0, 10);

function dayStart(s: string): number | null {
  if (!DATE_RE.test(s)) return null;
  const ms = Date.parse(`${s}T00:00:00Z`);
  if (Number.isNaN(ms) || new Date(ms).toISOString().slice(0, 10) !== s) return null;
  return ms / 1000;
}

const boundsText = (b: DataBounds): string =>
  b.first !== null && b.last !== null ? `${toDateString(b.first)} to ${toDateString(b.last)}` : "unknown";

/** Last `days` calendar days of data, ending on the last available date. */
export function presetRange(days: number, bounds: DataBounds): DateRange | null {
  if (bounds.first === null || bounds.last === null) return null;
  const to = bounds.last;
  const from = Math.max(to - (days - 1) * DAY, bounds.first);
  return { from: toDateString(from), to: toDateString(to) };
}

/** Pulls both ends into the available data. Unparseable dates are left for validation. */
export function clampRange(range: DateRange, bounds: DataBounds): DateRange {
  if (bounds.first === null || bounds.last === null) return range;
  const lo = toDateString(bounds.first);
  const hi = toDateString(bounds.last);
  const clamp = (s: string) => (dayStart(s) === null ? s : s < lo ? lo : s > hi ? hi : s);
  return { from: clamp(range.from), to: clamp(range.to) };
}

export function validateRange(range: DateRange | null, bounds: DataBounds): string | null {
  if (!range) return "Choose a date range, then scan.";
  const a = dayStart(range.from);
  const b = dayStart(range.to);
  if (a === null || b === null) return "Enter dates as YYYY-MM-DD.";
  if (a > b) return "The start date is after the end date. Swap them.";
  if (bounds.first !== null && bounds.last !== null) {
    if (b < dayStart(toDateString(bounds.first))! || a > bounds.last) {
      return `No data in this range. Data runs ${boundsText(bounds)}.`;
    }
  }
  return null;
}

/** ISO-8601 UTC strings for the scan request. */
export function rangeToRequest(range: DateRange): { from: string; to: string } {
  return { from: `${range.from}T00:00:00Z`, to: `${range.to}T23:59:59Z` };
}

export const rangeEquals = (a: DateRange | null, b: DateRange | null): boolean =>
  a === b || (a !== null && b !== null && a.from === b.from && a.to === b.to);