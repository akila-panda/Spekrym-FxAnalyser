/** DESK DK7 — TradingView (Pine v6) drawing limits and the meter that tracks them. Pure. */

export const PINE_LIMITS = { lines: 500, boxes: 500, labels: 500, polylines: 100, plots: 64 } as const;
export type MeterKey = keyof typeof PINE_LIMITS;
export type Meter = Record<MeterKey, number>;

export const METER_KEYS = Object.keys(PINE_LIMITS) as MeterKey[];
export const emptyMeter = (): Meter => ({ lines: 0, boxes: 0, labels: 0, polylines: 0, plots: 0 });

/** True when adding `add` to `used` keeps every counter within its limit. */
export const fits = (used: Meter, add: Partial<Meter>): boolean =>
  METER_KEYS.every((k) => used[k] + (add[k] ?? 0) <= PINE_LIMITS[k]);

export function addMeter(used: Meter, add: Partial<Meter>): Meter {
  const out = { ...used };
  for (const k of METER_KEYS) out[k] += add[k] ?? 0;
  return out;
}

export const meterLabel = (k: MeterKey, m: Meter): string => `${k} ${m[k]}/${PINE_LIMITS[k]}`;