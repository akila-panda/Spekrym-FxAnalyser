import type { CandlestickData, UTCTimestamp } from "lightweight-charts";
import { useEffect, useRef } from "react";
import { classifyChange } from "@/data/candleCache";
import { TF_SECONDS, type Candle, type Pair, type Timeframe } from "@/types/market";
import { createChartApi, type ChartApi } from "./chartApi";
import { useChartInstance, type ChartHandle } from "./useChartInstance";
import { useHistoryLoader } from "./useHistoryLoader";

export type OhlcBar = Pick<Candle, "time" | "open" | "high" | "low" | "close">;

interface Props {
  pair: Pair;
  tf: Timeframe;
  /** IANA zone for axis and crosshair labels. */
  tz: string;
  candles: readonly Candle[];
  hasMoreOlder: boolean;
  loadOlder: () => Promise<number>;
  onCrosshair?: (bar: OhlcBar | null) => void;
  onApi?: (api: ChartApi | null) => void;
}

const INITIAL_VISIBLE_BARS = 120;
const toBar = (c: Candle): CandlestickData => ({ time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close });

export function ChartCanvas({ pair, tf, tz, candles, hasMoreOlder, loadOlder, onCrosshair, onApi }: Props) {
  const { containerRef, handle, error } = useChartInstance(pair, tz);
  const prev = useRef<{ handle: ChartHandle | null; candles: readonly Candle[] }>({ handle: null, candles: [] });
  const live = useRef({ candles, onCrosshair, onApi });
  live.current = { candles, onCrosshair, onApi };

  // data: replace keeps the latest bars in view; prepend keeps the view where it was
  useEffect(() => {
    if (!handle) return;
    const before = prev.current.handle === handle ? prev.current.candles : [];
    const { kind, shift } = classifyChange(before, candles);
    prev.current = { handle, candles };
    if (kind === "same" && before.length > 0) return;
    const ts = handle.chart.timeScale();
    const range = ts.getVisibleLogicalRange();
    handle.series.setData(candles.map(toBar));
    if (kind === "prepend" && range) ts.setVisibleLogicalRange({ from: range.from + shift, to: range.to + shift });
    else if (kind === "replace" && candles.length > 0) {
      ts.setVisibleLogicalRange({ from: Math.max(0, candles.length - INITIAL_VISIBLE_BARS), to: candles.length + 4 });
    }
  }, [handle, candles]);

  useHistoryLoader({ handle, enabled: hasMoreOlder && candles.length > 0, loadOlder });

  useEffect(() => {
    if (!handle) return;
    const api = createChartApi(handle, () => live.current.candles);
    live.current.onApi?.(api);
    const onMove: Parameters<typeof handle.chart.subscribeCrosshairMove>[0] = (p) => {
      const d = p.seriesData.get(handle.series) as CandlestickData | undefined;
      live.current.onCrosshair?.(p.time !== undefined && d ? { time: Number(p.time), open: d.open, high: d.high, low: d.low, close: d.close } : null);
    };
    handle.chart.subscribeCrosshairMove(onMove);
    return () => {
      handle.chart.unsubscribeCrosshairMove(onMove);
      live.current.onApi?.(null);
    };
  }, [handle]);

  return (
    <div className="chart-host" data-tf={tf} data-bar-seconds={TF_SECONDS[tf]}>
      <div ref={containerRef} className="chart-el" />
      {error && <div className="panel-overlay" role="alert">Chart could not start in this browser.</div>}
    </div>
  );
}