import type { DateRange } from "@/scan/dateRange";
import type { Timeframe } from "@/types/market";
import { defaultLocks, type LockManagerLike } from "./leader";

export interface ScanKeyInput {
  tf: Timeframe;
  pair: string;
  strategy: string;
  params: Record<string, unknown>;
  asOf: number | null;
  range: DateRange | null;
}

/** Stable 32-bit FNV-1a over the params, independent of key order. */
export function paramsHash(params: Record<string, unknown>): string {
  const s = JSON.stringify(Object.keys(params).sort().map((k) => [k, params[k]]));
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** (pair, strategy, paramsHash, asOf) plus the chart and range, which also change the result. */
export function scanLockKey(k: ScanKeyInput): string {
  const range = k.range ? `${k.range.from}_${k.range.to}` : "none";
  return `spekrym:scan:${k.tf}:${k.pair}:${k.strategy}:${paramsHash(k.params)}:${k.asOf ?? "latest"}:${range}`;
}

export type LockResult<T> = { ran: true; value: T } | { ran: false };

/**
 * Runs `fn` only if no other window holds the lock for `key`. Without Web Locks it always runs.
 * `fn` is invoked synchronously when no manager exists, so callers keep their synchronous prelude.
 */
export async function withScanLock<T>(
  key: string, fn: () => Promise<T>, mgr: LockManagerLike | null = defaultLocks(),
): Promise<LockResult<T>> {
  if (!mgr) return { ran: true, value: await fn() };
  let out = { ran: false } as LockResult<T>;
  await mgr.request(key, { ifAvailable: true }, async (lock) => {
    if (!lock) return;
    out = { ran: true, value: await fn() };
  });
  return out;
}