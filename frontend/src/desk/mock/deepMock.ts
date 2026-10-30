/** DESK DK2 — Desk-only deep mock candles (always "sample"). Seeded + deterministic. Each TF is generated
 *  natively (regime-switching random walk, vol ∝ √TF); TFs are NOT aggregates of each other and there are no
 *  weekend gaps. Existing generateCandles.ts is untouched. Bars align to bucketStart; last bar is closed. */
import { canonicalHash } from "@/desk/lib/hash";
import { PAIR_META, TF_SECONDS, bucketStart, type Candle, type Pair, type Timeframe } from "@/types/market";

export const DEEP_NOW = 1_746_828_000; // same instant as mockDeskSource DEFAULT_NOW

/** Required minimums (DESK_PHASES DK2). */
export const DEEP_MIN_BARS: Record<Timeframe, number> = {
  W: 260, D: 1300, H4: 1500, H1: 2000, M15: 3000, M5: 3000, M1: 3000,
};
/** Generated counts (≥ minimums). */
export const DEEP_BARS: Record<Timeframe, number> = {
  W: 300, D: 1400, H4: 1600, H1: 2100, M15: 3200, M5: 3200, M1: 3200,
};

const START: Record<Pair, number> = { EUR_USD: 1.08, GBP_USD: 1.27, USD_JPY: 150, AUD_USD: 0.66, USD_CAD: 1.36 };

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const cache = new Map<string, readonly Candle[]>();

export function deepCandles(
  pair: Pair,
  tf: Timeframe,
  opts: { now?: number; bars?: number } = {},
): readonly Candle[] {
  const now = opts.now ?? DEEP_NOW;
  const n = opts.bars ?? DEEP_BARS[tf];
  const ck = `${pair}|${tf}|${now}|${n}`;
  const hit = cache.get(ck);
  if (hit) return hit;

  const sec = TF_SECONDS[tf];
  const dec = PAIR_META[pair].decimals;
  const round = (x: number) => Number(x.toFixed(dec));
  const rng = mulberry32(parseInt(canonicalHash([pair, tf]), 36));
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
  const sigma = 1.0e-4 * Math.sqrt(sec / 60);
  const lastOpen = bucketStart(tf, now - sec);

  const out: Candle[] = [];
  let p = START[pair];
  let left = 0;
  let drift = 0;
  let volMul = 1;
  for (let i = 0; i < n; i++) {
    if (left <= 0) {
      left = 15 + Math.floor(rng() * 60);
      const k = rng();
      drift = k < 0.35 ? 0.15 * sigma : k < 0.7 ? -0.15 * sigma : 0;
      volMul = 0.7 + rng() * 0.9;
    }
    left--;
    const o = round(p);
    let r = drift + sigma * volMul * gauss();
    if (rng() < 0.04) r += (rng() < 0.5 ? -1 : 1) * sigma * volMul * 3.5;
    const c = round(o * Math.exp(r));
    const w = Math.abs(gauss()) * sigma * volMul * 0.6 * o;
    const high = round(Math.max(o, c) + w * rng());
    const low = round(Math.min(o, c) - w * rng());
    out.push({
      time: lastOpen - (n - 1 - i) * sec,
      open: o,
      high: Math.max(high, o, c),
      low: Math.min(low, o, c),
      close: c,
      volume: 100 + Math.floor(rng() * 900),
    });
    p = c;
  }
  cache.set(ck, out);
  return out;
}