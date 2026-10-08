import type { BoundsResponse, Candle, Pair, ScanRequest, ScanResult, StrategyDef, Timeframe } from "@/types";

export const MAX_CANDLES = 20000;

/** All times are UTC seconds. `from` and `to` are inclusive. `before` is exclusive.
 *  With `limit`, the most recent `limit` matching candles are returned (scroll-back).
 *  Result is always ascending. */
export interface CandleQuery {
  pair: Pair;
  tf: Timeframe;
  from?: number;
  to?: number;
  before?: number;
  limit?: number;
}

export interface DataSource {
  readonly kind: "mock" | "api";
  getCandles(q: CandleQuery, signal?: AbortSignal): Promise<Candle[]>;
  getBounds(pair: Pair, signal?: AbortSignal): Promise<BoundsResponse>;
  getStrategies(signal?: AbortSignal): Promise<StrategyDef[]>;
  runScan(req: ScanRequest, signal?: AbortSignal): Promise<ScanResult>;
}