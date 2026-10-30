import { CandlestickSeries, createChart, type IChartApi, type ISeriesApi } from "lightweight-charts";
import { useEffect, useRef, useState } from "react";
import { useSettingsStore } from "@/components/ui/settingsStore";
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
  const themeEpoch = useSettingsStore((s) => s.epoch);

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

  // Theme change: re-read the tokens and recolour (colours only; layout and formatters are untouched).
  useEffect(() => {
    if (!handle) return;
    const t = readTokens();
    const o = chartOptions(t);
    handle.chart.applyOptions({ layout: o.layout, grid: o.grid, rightPriceScale: o.rightPriceScale, crosshair: o.crosshair, timeScale: { borderColor: t.grid } });
    handle.series.applyOptions(candleOptions(t, pair));
  }, [handle, themeEpoch, pair]);

  return { containerRef, handle, error };
}