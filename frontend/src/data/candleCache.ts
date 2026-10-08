import type { Candle, Pair, Timeframe } from "@/types/market";

/** Ordered candle store per (pair, tf). Merges de-duplicate by `time` (incoming wins)
 *  and every change produces a new array, so React can compare by identity. */
export class CandleCache {
  private store = new Map<string, readonly Candle[]>();
  private static key = (pair: Pair, tf: Timeframe) => `${pair}:${tf}`;

  get(pair: Pair, tf: Timeframe): readonly Candle[] {
    return this.store.get(CandleCache.key(pair, tf)) ?? [];
  }

  /** Merge any batch, in any order. Returns how many bars were newly added. */
  merge(pair: Pair, tf: Timeframe, incoming: readonly Candle[]): number {
    if (incoming.length === 0) return 0;
    const existing = this.get(pair, tf);
    const sorted = [...incoming].sort((a, b) => a.time - b.time);
    const out: Candle[] = [];
    let i = 0;
    let j = 0;
    const push = (c: Candle) => {
      const last = out[out.length - 1];
      if (last && last.time === c.time) out[out.length - 1] = c;
      else out.push(c);
    };
    while (i < existing.length || j < sorted.length) {
      const a = existing[i];
      const b = sorted[j];
      if (a && (!b || a.time < b.time)) {
        push(a);
        i++;
      } else if (b && (!a || b.time < a.time)) {
        push(b);
        j++;
      } else if (a && b) {
        push(b); // same time: incoming wins
        i++;
        j++;
      }
    }
    this.store.set(CandleCache.key(pair, tf), out);
    return out.length - existing.length;
  }

  /** Drop what is stored for this key and store `incoming` instead. */
  replace(pair: Pair, tf: Timeframe, incoming: readonly Candle[]): void {
    this.store.delete(CandleCache.key(pair, tf));
    this.merge(pair, tf, incoming);
  }

  oldest(pair: Pair, tf: Timeframe): number | undefined {
    return this.get(pair, tf)[0]?.time;
  }
  newest(pair: Pair, tf: Timeframe): number | undefined {
    const a = this.get(pair, tf);
    return a[a.length - 1]?.time;
  }
  clear(): void {
    this.store.clear();
  }
}

export type ChangeKind = "same" | "replace" | "prepend" | "append";

/** How `next` differs from `prev`, so the chart can keep the view steady.
 *  `shift` = number of bars added at the front (prepend). */
export function classifyChange(prev: readonly Candle[], next: readonly Candle[]): { kind: ChangeKind; shift: number } {
  const pf = prev[0];
  const pl = prev[prev.length - 1];
  const nf = next[0];
  const nl = next[next.length - 1];
  if (!nf || !nl) return { kind: prev.length === 0 ? "same" : "replace", shift: 0 };
  if (!pf || !pl) return { kind: "replace", shift: 0 };
  if (nf.time === pf.time && nl.time === pl.time && next.length === prev.length) return { kind: "same", shift: 0 };
  if (nl.time === pl.time && nf.time < pf.time) {
    const shift = next.findIndex((c) => c.time === pf.time);
    if (shift > 0) return { kind: "prepend", shift };
  }
  if (nf.time === pf.time && nl.time > pl.time) return { kind: "append", shift: 0 };
  return { kind: "replace", shift: 0 };
}