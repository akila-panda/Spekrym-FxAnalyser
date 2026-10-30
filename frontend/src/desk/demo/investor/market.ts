/** Frozen synthetic market. All chapters and timeframes read the same M1 tape.
 * Continuous illustrative UTC calendar, not broker data or an FX session calendar. */
import { bucketStart, PAIRS, PAIR_META, TF_SECONDS, type Candle, type Pair, type Timeframe } from '@/types/market';

export type Story = 'develop' | 'protect' | 'review';
export const STORIES: Record<Story, string> = {
  develop: 'A setup develops', protect: 'Conditions change', review: 'Every decision can be reviewed',
};
export const START = Date.UTC(2026, 9, 19, 7) / 1000;
export const END = 120;
export const BASE: Record<Pair, number> = { EUR_USD: 1.10, GBP_USD: 1.28, AUD_USD: .66, USD_CAD: 1.36, USD_JPY: 149.5 };
export const at = (minute: number) => START + minute * 60;
export const stamp = (minute: number) => new Date(at(minute) * 1000).toISOString().slice(11, 16) + ' UTC';
export const price = (pair: Pair, pips: number) => Number((BASE[pair] + pips * PAIR_META[pair].pip).toFixed(PAIR_META[pair].decimals));
const cache = new Map<string, readonly Candle[]>();

function interpolate(points: readonly (readonly [number, number])[], t: number): number {
  for (let i = 1; i < points.length; i++) {
    const [a, x] = points[i - 1]!, [b, y] = points[i]!;
    if (t <= b) return x + (y - x) * (t - a) / (b - a);
  }
  return points.at(-1)![1];
}

function displacement(pair: Pair, story: Story, minute: number): number {
  if (minute <= 0) return -8 + 2 * Math.sin(minute / 28) + 2 * Math.sin(minute / 190);
  const knots: [number, number][] = [[0, -8], [15, -10], [25, -15], [30, -8], [45, -2], [50, 1], [60, 4]];
  knots.push(...(story === 'develop' ? [[75, 10], [90, 16], [105, 24], [120, 27]] :
    [[75, -4], [90, -13], [105, -24], [120, -27]]) as [number, number][]);
  const factor = ({ EUR_USD: 1, GBP_USD: .8, AUD_USD: .65, USD_JPY: -.6, USD_CAD: -.5 })[pair];
  return interpolate(knots, minute) * factor;
}

export function tape(pair: Pair, story: Story): readonly Candle[] {
  const key = `${pair}:${story}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const result: Candle[] = [];
  for (let m = -21 * 1440; m < END; m++) {
    const open = price(pair, displacement(pair, story, m));
    const close = price(pair, displacement(pair, story, m + 1));
    const wick = PAIR_META[pair].pip * (.3 + .2 * Math.abs(Math.sin(m)));
    result.push({ time: at(m), open, close,
      high: Number((Math.max(open, close) + wick).toFixed(PAIR_META[pair].decimals)),
      low: Number((Math.min(open, close) - wick).toFixed(PAIR_META[pair].decimals)), volume: 100 + Math.abs(m % 70) });
  }
  cache.set(key, result);
  return result;
}

/** Filter M1 first, then aggregate. The final parent may be forming, never completed with future children. */
export function candles(pair: Pair, story: Story, tf: Timeframe, minute: number): Candle[] {
  const bars = tape(pair, story).filter(c => c.time + 60 <= at(minute));
  const out: Candle[] = [];
  for (const c of bars) {
    const time = bucketStart(tf, c.time), last = out.at(-1);
    if (last?.time === time) {
      last.high = Math.max(last.high, c.high); last.low = Math.min(last.low, c.low);
      last.close = c.close; last.volume += c.volume;
    } else out.push({ ...c, time });
  }
  return out;
}
export function barAt(pair: Pair, story: Story, minute: number): Candle {
  return tape(pair, story)[21 * 1440 + Math.max(0, minute) - 1]!;
}
export function forming(tf: Timeframe, minute: number): boolean {
  return bucketStart(tf, at(minute) - 1) + TF_SECONDS[tf] > at(minute);
}

/** Relative changes in a fixed five-pair basket; descriptive, not probabilities or trade rankings. */
export function opportunities(story: Story, minute: number) {
  return PAIRS.map(pair => {
    const close = barAt(pair, story, minute).close;
    const change = (close / barAt(pair, story, 0).close - 1) * 100;
    return { pair, change, pips: (close - BASE[pair]) / PAIR_META[pair].pip,
      reason: close >= BASE[pair] ? 'Above sample trigger' : 'Below sample trigger; confirmation missing' };
  }).sort((a, b) => b.change - a.change);
}
export function strength(story: Story, minute: number) {
  const totals = new Map<string, { sum: number; n: number }>();
  for (const row of opportunities(story, minute)) {
    const meta = PAIR_META[row.pair];
    for (const [ccy, sign] of [[meta.base, 1], [meta.quote, -1]] as const) {
      const old = totals.get(ccy) ?? { sum: 0, n: 0 };
      totals.set(ccy, { sum: old.sum + row.change * sign, n: old.n + 1 });
    }
  }
  return [...totals].map(([ccy, x]) => ({ ccy, value: x.sum / x.n })).sort((a, b) => b.value - a.value);
}
