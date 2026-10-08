import { useCallback, useEffect, useRef, useState } from "react";
import { getDataSource } from "@/api/sourceFactory";
import type { DataSource } from "@/api/dataSource";
import { CandleCache } from "@/data/candleCache";
import type { Candle, Pair, Timeframe } from "@/types/market";

export interface UseCandlesArgs {
  pair: Pair;
  tf: Timeframe;
  /** UTC seconds, or null for the latest available. */
  asOf: number | null;
  source?: DataSource;
  initialBars?: number;
  olderBars?: number;
}

export interface UseCandlesResult {
  candles: readonly Candle[];
  status: "loading" | "ready" | "error";
  error?: Error;
  loadingOlder: boolean;
  hasMoreOlder: boolean;
  /** Resolves with the number of bars added (0 = nothing more, or stale). */
  loadOlder: () => Promise<number>;
  reload: () => void;
}

interface Loaded {
  key: string;
  status: "ready" | "error";
  candles: readonly Candle[];
  hasMore: boolean;
  error?: Error;
}

const toError = (e: unknown): Error => (e instanceof Error ? e : new Error(String(e)));
const isAbort = (e: unknown) => e instanceof Error && (e.name === "AbortError" || (e as { kind?: string }).kind === "aborted");

export function useCandles(args: UseCandlesArgs): UseCandlesResult {
  const { pair, tf, asOf, initialBars = 300, olderBars = 300 } = args;
  const source = args.source ?? getDataSource();
  const [reloadN, setReloadN] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const cache = useRef(new CandleCache());
  const token = useRef(0);
  const olderBusy = useRef(false);
  const olderCtl = useRef<AbortController | null>(null);

  const key = `${pair}|${tf}|${asOf ?? "latest"}|${reloadN}`;
  const current = loaded?.key === key ? loaded : null;
  const live = useRef({ key, pair, tf, source, olderBars, current });
  live.current = { key, pair, tf, source, olderBars, current };

  useEffect(() => {
    const mine = ++token.current;
    const ctl = new AbortController();
    olderCtl.current?.abort();
    olderBusy.current = false;
    setLoadingOlder(false);
    cache.current.clear();
    source
      .getCandles({ pair, tf, to: asOf ?? undefined, limit: initialBars }, ctl.signal)
      .then((c) => {
        if (mine !== token.current) return; // late response for old inputs
        cache.current.replace(pair, tf, c);
        setLoaded({ key, status: "ready", candles: cache.current.get(pair, tf), hasMore: c.length >= initialBars });
      })
      .catch((e: unknown) => {
        if (mine !== token.current || isAbort(e)) return;
        setLoaded({ key, status: "error", candles: [], hasMore: false, error: toError(e) });
      });
    return () => ctl.abort();
  }, [key, source, pair, tf, asOf, initialBars]);

  const loadOlder = useCallback(async (): Promise<number> => {
    const { key: k, pair: p, tf: t, source: s, olderBars: n, current: cur } = live.current;
    if (olderBusy.current || !cur || cur.status !== "ready" || !cur.hasMore) return 0;
    const oldest = cache.current.oldest(p, t);
    if (oldest === undefined) return 0;
    const mine = token.current;
    const ctl = new AbortController();
    olderCtl.current = ctl;
    olderBusy.current = true;
    setLoadingOlder(true);
    try {
      const c = await s.getCandles({ pair: p, tf: t, before: oldest, limit: n }, ctl.signal);
      if (mine !== token.current) return 0;
      const added = cache.current.merge(p, t, c);
      setLoaded((prev) =>
        prev && prev.key === k ? { ...prev, candles: cache.current.get(p, t), hasMore: added > 0 && c.length >= n } : prev,
      );
      return added;
    } catch (e) {
      if (mine === token.current && !isAbort(e)) setLoaded((prev) => (prev && prev.key === k ? { ...prev, hasMore: false } : prev));
      return 0;
    } finally {
      if (mine === token.current) {
        olderBusy.current = false;
        setLoadingOlder(false);
      }
    }
  }, []);

  const reload = useCallback(() => setReloadN((n) => n + 1), []);

  return {
    candles: current?.candles ?? [],
    status: current?.status ?? "loading",
    error: current?.error,
    loadingOlder,
    hasMoreOlder: current?.hasMore ?? false,
    loadOlder,
    reload,
  };
}