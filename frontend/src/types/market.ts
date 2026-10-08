export const PAIRS = ["EUR_USD", "GBP_USD", "USD_JPY", "AUD_USD", "USD_CAD"] as const;
export type Pair = (typeof PAIRS)[number];

export const TIMEFRAMES = ["M1", "M5", "M15", "H1", "H4"] as const;
export type Timeframe = (typeof TIMEFRAMES)[number];

export const TF_SECONDS: Record<Timeframe, number> = {
  M1: 60,
  M5: 300,
  M15: 900,
  H1: 3600,
  H4: 14400,
};

/** Panel order, top-down. */
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