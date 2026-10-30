import type { Candle, Pair } from "@/types";
import { ApiError } from "../client";
import { MAX_CANDLES, type CandleQuery, type DataSource } from "../dataSource";
import { getDataset } from "./generateCandles";
import { MOCK_STRATEGIES } from "./mockStrategies";
import { runMockScan } from "./mockScanner";
import { TIMEFRAMES } from "@/types/market";

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new ApiError("aborted", "Request cancelled"));
    const onAbort = () => {
      clearTimeout(timer);
      reject(new ApiError("aborted", "Request cancelled"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export interface MockSourceOptions {
  /** Delay for candles, bounds and strategies. */
  delayMs?: number;
  /** Delay for scans, long enough to see the scanning state. */
  scanDelayMs?: number;
  seed?: number;
}

export function createMockSource(o: MockSourceOptions = {}): DataSource {
  const delay = o.delayMs ?? 120;
  const scanDelay = o.scanDelayMs ?? 600;
  const seed = o.seed ?? 1;
  return {
    kind: "mock",
    async getCandles(q: CandleQuery, signal) {
      await sleep(delay, signal);
      const { from = -Infinity, to = Infinity, before = Infinity } = q;
      const out: Candle[] = getDataset(q.pair, seed)[q.tf].filter((c) => c.time >= from && c.time <= to && c.time < before);
      const limit = Math.min(q.limit ?? MAX_CANDLES, MAX_CANDLES);
      return out.length > limit ? out.slice(out.length - limit) : out;
    },
    async getBounds(pair: Pair, signal) {
      await sleep(delay, signal);
      const ds = getDataset(pair, seed);
      const b = (tf: (typeof TIMEFRAMES)[number]) => ({ first: ds[tf][0]?.time ?? null, last: ds[tf][ds[tf].length - 1]?.time ?? null });
      return { pair, bounds: { M1: b("M1"), M5: b("M5"), M15: b("M15"), H1: b("H1"), H4: b("H4"), D: b("D"), W: b("W") } };
    },
    async getStrategies(signal) {
      await sleep(delay, signal);
      return structuredClone(MOCK_STRATEGIES);
    },
    async runScan(req, signal) {
      await sleep(scanDelay, signal);
      return runMockScan(req, getDataset(req.pair, seed));
    },
  };
}