import { CandlestickSeries, createChart, type IChartApi, type ISeriesApi } from "lightweight-charts";
import { useEffect, useRef, useState } from "react";
import type { Pair } from "@/types/market";
import { candleOptions, chartOptions, readTokens, timeAxisOptions } from "./theme";

export interface ChartHandle {
  chart: IChartApi;
  series: ISeriesApi<"Candlestick">;
}

/** Creates and disposes the chart. Sizing is handled by `autoSize` (a ResizeObserver inside the library). */
export function useChartInstance(pair: Pair, tz: string) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [handle, setHandle] = useState<ChartHandle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const initial = useRef({ pair, tz });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    try {
      const t = readTokens();
      const chart = createChart(el, { ...chartOptions(t), ...timeAxisOptions(initial.current.tz) });
      const series = chart.addSeries(CandlestickSeries, candleOptions(t, initial.current.pair));
      setError(null);
      setHandle({ chart, series });
      return () => {
        setHandle(null);
        chart.remove();
      };
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chart failed to start");
      return undefined;
    }
  }, []);

  useEffect(() => {
    if (handle) handle.series.applyOptions(candleOptions(readTokens(), pair));
  }, [handle, pair]);

  useEffect(() => {
    if (handle) handle.chart.applyOptions(timeAxisOptions(tz));
  }, [handle, tz]);

  return { containerRef, handle, error };
}