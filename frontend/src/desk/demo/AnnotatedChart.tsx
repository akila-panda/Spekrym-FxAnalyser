/** DEMO (removable) — a chart that draws a given set of Annotations (the production chart + annotation path).
 *  Reused by DemoChart and the DESK stage demo chart. Delete src/desk/demo/ to remove. */
import { useEffect, useRef, useState } from "react";
import { ChartCanvas } from "@/chart/ChartCanvas";
import type { ChartApi } from "@/chart/chartApi";
import { AnnotationManager } from "@/annotations/AnnotationManager";
import type { Annotation } from "@/types/annotations";
import { TF_SECONDS, type Candle, type Pair, type Timeframe } from "@/types/market";

export interface ChartFocus { key: string; from: number; to: number; prices: number[] }
interface Props { onApiReady?: (api: ChartApi | null) => void; focus?: ChartFocus; resetKey?: string; futureBars?: number; pair: Pair; tf: Timeframe; candles: readonly Candle[]; annotations: readonly Annotation[]; }

export function AnnotatedChart({ pair, tf, candles, annotations, focus, resetKey, futureBars = 4, onApiReady }: Props) {
  const [api, setApi] = useState<ChartApi | null>(null);
  const mgrRef = useRef<AnnotationManager | null>(null);

  useEffect(() => { onApiReady?.(api); return () => onApiReady?.(null); }, [api, onApiReady]);

  useEffect(() => {
    if (!api) return;
    const mgr = new AnnotationManager(api, tf);
    mgrRef.current = mgr;
    return () => { mgr.dispose(); mgrRef.current = null; };
  }, [api, tf]);

  useEffect(() => {
    if (api && mgrRef.current) mgrRef.current.sync(annotations, pair);
  }, [api, annotations, pair, tf]);

  useEffect(() => {
    if (!api || !focus) return;
    api.focusRange(focus.from, focus.to, 12);
    const last = candles.at(-1)?.time;
    const range = api.getLogicalRange();
    if (last !== undefined && range && focus.to > last) {
      api.setLogicalRange(Math.min(range.from, candles.length - 35), candles.length - 1 + (focus.to - last) / TF_SECONDS[tf] + 10);
    }
    const prices = focus.prices.filter(Number.isFinite);
    if (!prices.length) return;
    const lo = Math.min(...prices), hi = Math.max(...prices);
    const pad = Math.max((hi - lo) * 0.15, Math.abs(lo) * 0.0001);
    return api.attachPrimitive({ autoscaleInfo: () => ({ priceRange: { minValue: lo - pad, maxValue: hi + pad } }) });
  }, [api, focus, candles, tf]);

  useEffect(() => {
    if (api && !focus && candles.length) api.setLogicalRange(Math.max(0, candles.length - 90), candles.length + futureBars);
  }, [api, candles, focus, resetKey, futureBars]);

  return <ChartCanvas pair={pair} tf={tf} tz="UTC" candles={candles} hasMoreOlder={false} loadOlder={async () => 0} onApi={setApi} />;
}
