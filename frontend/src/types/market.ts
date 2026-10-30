export const PAIRS = ["EUR_USD", "GBP_USD", "USD_JPY", "AUD_USD", "USD_CAD"] as const;
export type Pair = (typeof PAIRS)[number];

export const TIMEFRAMES = ["M1", "M5", "M15", "H1", "H4", "D", "W"] as const;
export type Timeframe = (typeof TIMEFRAMES)[number];

export const TF_SECONDS: Record<Timeframe, number> = {
  M1: 60,
  M5: 300,
  M15: 900,
  H1: 3600,
  H4: 14400,
  D: 86400,
  W: 604800,
};

/** Bucket origin (UTC seconds) when aggregating from M1. D = 22:00 UTC (FX day roll),
 *  W = Sunday 22:00 UTC (FX week open). Others are epoch-aligned. */
export const TF_ANCHOR: Record<Timeframe, number> = {
  M1: 0, M5: 0, M15: 0, H1: 0, H4: 0,
  D: 79200,
  W: 338400,
};

/** Start of the bucket containing `sec` for `tf`. */
export function bucketStart(tf: Timeframe, sec: number): number {
  const s = TF_SECONDS[tf];
  const a = TF_ANCHOR[tf];
  return Math.floor((sec - a) / s) * s + a;
}

/** Rank high -> low (W first). */
export const TF_ORDER_HIGH_TO_LOW: readonly Timeframe[] = ["W", "D", "H4", "H1", "M15", "M5", "M1"];

/** True when `a` is a strictly higher timeframe than `b`. */
export const isHigherTf = (a: Timeframe, b: Timeframe): boolean => TF_SECONDS[a] > TF_SECONDS[b];

/** Panel order, top-down. The 5-panel grid is unchanged; D/W are chart-only (chart:D, chart:W). */
export const PANEL_ORDER: readonly Timeframe[] = ["H4", "H1", "M15", "M5", "M1"];

export interface PairMeta {
  base: string;
  quote: string;
  /** Price decimals: 3 for JPY pairs, 5 otherwise. */
  decimals: number;
  /** Pip size: 0.01 for JPY pairs, 0.0001 otherwise (same as backtest/engine.py). */
  pip: number;
}

export const PAIR_META: Record<Pair, PairMeta> = {
  EUR_USD: { base: "EUR", quote: "USD", decimals: 5, pip: 0.0001 },
  GBP_USD: { base: "GBP", quote: "USD", decimals: 5, pip: 0.0001 },
  USD_JPY: { base: "USD", quote: "JPY", decimals: 3, pip: 0.01 },
  AUD_USD: { base: "AUD", quote: "USD", decimals: 5, pip: 0.0001 },
  USD_CAD: { base: "USD", quote: "CAD", decimals: 5, pip: 0.0001 },
};

/** `time` is UTC seconds. */
export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}