import {
  AreaSeries, createSeriesMarkers, HistogramSeries, LineSeries, LineType,
  type IPaneApi, type ISeriesApi, type ISeriesMarkersPluginApi, type ISeriesPrimitive,
  type SeriesMarker, type SeriesType, type Time, type UTCTimestamp,
} from "lightweight-charts";
import { makeCoordinates } from "@/annotations/primitives/coords";
import type { Coordinates } from "@/annotations/primitives/types";
import type { IndicatorSpec } from "@/annotations/toPrimitives";
import type { Candle } from "@/types/market";
import type { ChartHandle } from "./useChartInstance";

/** The small imperative API other phases use to drive a chart. */
export interface ChartApi {
  /** Show [from, to] (UTC seconds) with `padBars` of room on each side. */
  focusRange(from: number, to: number, padBars?: number): void;
  /** Keep the current zoom, centre on `time`. */
  centerOn(time: number): void;
  scrollToLatest(): void;
  timeToX(time: number): number | null;
  priceToY(price: number): number | null;
  takeScreenshot(): HTMLCanvasElement;
  /** Currently loaded bars (live). */
  getCandles(): readonly Candle[];
  /** Attach a series primitive; returns the detach function. */
  attachPrimitive(p: ISeriesPrimitive<Time>): () => void;
  /** Replace all series markers. */
  setMarkers(markers: SeriesMarker<Time>[]): void;
  /** Reconcile native indicator series (lines/bands) across the price pane and sub-panes. */
  syncIndicators(specs: readonly IndicatorSpec[]): void;
  /** Time and price to CSS pixels, extrapolating off the loaded bars (same maths the primitives use). */
  coordinates(barSeconds: number): Coordinates;
}

/** Index of the first candle at or after `time` (clamped to the last bar). */
export function indexAtOrAfter(candles: readonly Candle[], time: number): number {
  let lo = 0;
  let hi = candles.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((candles[mid]?.time ?? Infinity) < time) lo = mid + 1;
    else hi = mid;
  }
  return Math.min(lo, Math.max(0, candles.length - 1));
}

export function createChartApi(h: ChartHandle, getCandles: () => readonly Candle[]): ChartApi {
  const ts = () => h.chart.timeScale();
  let markers: ISeriesMarkersPluginApi<Time> | null = null;

  // Native indicator series live outside the primitive system (they are real chart series on their own panes).
  const panes = new Map<string, IPaneApi<Time>>();
  const indSeries = new Map<string, { series: ISeriesApi<SeriesType, Time>; kind: string; dataSig: string }>();
  const ensurePane = (id: string): number => {
    if (id === "price") return 0;
    let p = panes.get(id);
    if (!p) {
      p = h.chart.addPane() as unknown as IPaneApi<Time>;
      panes.set(id, p);
    }
    return p.paneIndex();
  };

  return {
    focusRange(from, to, padBars = 5) {
      const c = getCandles();
      if (c.length === 0) return;
      const a = indexAtOrAfter(c, from);
      const b = Math.max(a, indexAtOrAfter(c, to));
      ts().setVisibleLogicalRange({ from: a - padBars, to: b + padBars });
    },
    centerOn(time) {
      const c = getCandles();
      const r = ts().getVisibleLogicalRange();
      if (c.length === 0 || !r) return;
      const mid = indexAtOrAfter(c, time);
      const half = (r.to - r.from) / 2;
      ts().setVisibleLogicalRange({ from: mid - half, to: mid + half });
    },
    scrollToLatest: () => ts().scrollToRealTime(),
    timeToX: (t) => ts().timeToCoordinate(t as UTCTimestamp),
    priceToY: (p) => h.series.priceToCoordinate(p),
    takeScreenshot: () => h.chart.takeScreenshot(),
    getCandles,
    setMarkers(m) {
      try {
        markers ??= createSeriesMarkers(h.series, []);
        markers.setMarkers(m);
      } catch {
        /* chart already disposed */
      }
    },
    syncIndicators(specs) {
      try {
        const keep = new Set(specs.map((s) => s.id));
        for (const [id, e] of indSeries) {
          if (!keep.has(id)) {
            h.chart.removeSeries(e.series);
            indSeries.delete(id);
          }
        }
        for (const s of specs) {
          const kind = `${s.type}|${s.paneId}`;
          let e = indSeries.get(s.id);
          if (e && e.kind !== kind) {
            h.chart.removeSeries(e.series);
            indSeries.delete(s.id);
            e = undefined;
          }
          if (!e) {
            const def = s.type === "histogram" ? HistogramSeries : s.type === "area" ? AreaSeries : LineSeries;
            const opts: Record<string, unknown> = { priceLineVisible: false, lastValueVisible: false, color: s.color, title: s.title };
            if (s.type === "step") opts.lineType = LineType.WithSteps;
            if (s.type === "dots") { opts.lineVisible = false; opts.pointMarkersVisible = true; }
            const series = h.chart.addSeries(def, opts, ensurePane(s.paneId)) as ISeriesApi<SeriesType, Time>;
            e = { series, kind, dataSig: "" };
            indSeries.set(s.id, e);
          }
          const dataSig = JSON.stringify(s.data);
          if (e.dataSig !== dataSig) {
            // null value = whitespace (warm-up gap), so the line does not interpolate across it.
            e.series.setData(s.data.map((d) => (d.value === null ? { time: d.time as UTCTimestamp } : { time: d.time as UTCTimestamp, value: d.value })));
            e.dataSig = dataSig;
          }
          e.series.applyOptions({ color: s.color, title: s.title });
        }
        // Empty sub-panes are left in place: removing a pane while series/primitives reference it
        // corrupts the chart's pane state. They are reused by id on the next sync.
      } catch {
        /* chart already disposed */
      }
    },
    coordinates: (barSeconds) => makeCoordinates(ts(), h.series, getCandles, barSeconds),
    attachPrimitive(p) {
      h.series.attachPrimitive(p);
      return () => {
        try {
          h.series.detachPrimitive(p);
        } catch {
          /* chart already disposed */
        }
      };
    },
  };
}