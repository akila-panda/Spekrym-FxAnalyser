/** DEMO (removable) — deterministic mock candles for the demo surface, reusing the Scan mock generator.
 *  Delete src/desk/demo/ to remove the whole demo (see ./README.md). No core behaviour depends on this. */
import { aggregate, generateM1 } from "@/api/mock/generateCandles";
import { TF_ANCHOR, TF_SECONDS, type Candle, type Pair, type Timeframe } from "@/types/market";

export const DEMO_PAIR: Pair = "EUR_USD";
export const DEMO_TF: Timeframe = "H1";
const DEMO_SEED = 7;

const m1Cache = new Map<Pair, Candle[]>();
const tfCache = new Map<string, Candle[]>();

function m1(pair: Pair): Candle[] {
  let c = m1Cache.get(pair);
  if (!c) { c = generateM1(pair, DEMO_SEED); m1Cache.set(pair, c); }
  return c;
}

/** Candles for a pair/TF (M1 native, higher TFs aggregated). Cached so the demo chart is stable. */
export function demoCandles(pair: Pair = DEMO_PAIR, tf: Timeframe = DEMO_TF): Candle[] {
  const key = `${pair}:${tf}`;
  let c = tfCache.get(key);
  if (!c) { c = tf === "M1" ? m1(pair) : aggregate(m1(pair), TF_SECONDS[tf], TF_ANCHOR[tf]); tfCache.set(key, c); }
  return c;
}
