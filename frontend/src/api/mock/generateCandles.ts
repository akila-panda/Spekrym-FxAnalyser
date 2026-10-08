/** DEV ONLY. Seeded M1 random walk; M5..H4 are aggregated from M1 so all
 *  five timeframes agree exactly. */
import { gaussian, mulberry32 } from "@/lib/rng";
import { PAIRS, PAIR_META, TF_SECONDS, TIMEFRAMES, type Candle, type Pair, type Timeframe } from "@/types/market";

export type Dataset = Record<Timeframe, Candle[]>;

/** Sun 2025-04-06 22:00 UTC (market open) up to Fri 2025-05-09 22:00 UTC (exclusive). */
export const MOCK_START = Date.UTC(2025, 3, 6, 22, 0, 0) / 1000;
export const MOCK_END = Date.UTC(2025, 4, 9, 22, 0, 0) / 1000;

const START_PRICE: Record<Pair, number> = {
  EUR_USD: 1.1, GBP_USD: 1.3, USD_JPY: 145, AUD_USD: 0.64, USD_CAD: 1.38,
};
const BASE_PIPS = 0.6; // typical 1-minute sigma in pips

/** Friday 22:00 to Sunday 22:00 UTC. */
export function isMarketClosed(sec: number): boolean {
  const day = Math.floor(sec / 86400);
  const dow = (day + 4) % 7; // 0 = Sunday (1970-01-01 was a Thursday)
  const sod = sec - day * 86400;
  if (dow === 5) return sod >= 79200;
  if (dow === 6) return true;
  if (dow === 0) return sod < 79200;
  return false;
}

function sessionVol(sec: number): number {
  const m = (sec % 86400) / 60;
  if (m >= 420 && m < 435) return 1.8; // London open
  if (m >= 420 && m < 720) return 1.2;
  if (m >= 840 && m < 900) return 1.8; // New York AM
  if (m >= 720 && m < 960) return 1.5;
  if (m >= 960 && m < 1320) return 0.7;
  if (m >= 1320) return 0.4;
  return 0.6;
}

function hashSeed(pair: string, seed: number): number {
  let h = 2166136261 ^ seed;
  for (const ch of pair) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

export function generateM1(pair: Pair, seed = 1): Candle[] {
  const { decimals, pip } = PAIR_META[pair];
  const k = 10 ** decimals;
  const round = (x: number) => Math.round(x * k) / k;
  const rng = mulberry32(hashSeed(pair, seed));
  const out: Candle[] = [];
  let price = round(START_PRICE[pair]);
  let trend = 0;
  let wasClosed = false;
  for (let t = MOCK_START; t < MOCK_END; t += 60) {
    if (isMarketClosed(t)) {
      wasClosed = true;
      continue;
    }
    const vol = sessionVol(t);
    const sigma = BASE_PIPS * vol * pip;
    if (wasClosed && out.length) price = round(price + gaussian(rng) * 1.5 * pip);
    wasClosed = false;
    trend = 0.995 * trend + 0.05 * gaussian(rng);
    const ret = gaussian(rng) * sigma + trend * sigma * 0.1;
    const open = price;
    const close = round(open + ret);
    const high = round(Math.max(open, close) + Math.abs(gaussian(rng)) * sigma * 0.5);
    const low = round(Math.min(open, close) - Math.abs(gaussian(rng)) * sigma * 0.5);
    const volume = Math.round((40 + rng() * 80) * vol + (Math.abs(ret) / sigma) * 20);
    out.push({ time: t, open, high, low, close, volume });
    price = close;
  }
  return out;
}

export function aggregate(m1: readonly Candle[], tfSec: number): Candle[] {
  const out: Candle[] = [];
  let cur: Candle | undefined;
  for (const c of m1) {
    const bucket = Math.floor(c.time / tfSec) * tfSec;
    if (cur && cur.time === bucket) {
      cur.high = Math.max(cur.high, c.high);
      cur.low = Math.min(cur.low, c.low);
      cur.close = c.close;
      cur.volume += c.volume;
    } else {
      cur = { time: bucket, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume };
      out.push(cur);
    }
  }
  return out;
}

export function generateDataset(pair: Pair, seed = 1): Dataset {
  const m1 = generateM1(pair, seed);
  const ds = {} as Dataset;
  for (const tf of TIMEFRAMES) ds[tf] = tf === "M1" ? m1 : aggregate(m1, TF_SECONDS[tf]);
  return ds;
}

const cache = new Map<string, Dataset>();
export function getDataset(pair: Pair, seed = 1): Dataset {
  const key = `${pair}:${seed}`;
  let ds = cache.get(key);
  if (!ds) {
    ds = generateDataset(pair, seed);
    cache.set(key, ds);
  }
  return ds;
}

export const MOCK_PAIRS = PAIRS;