/** DEMO (removable) — chart for the ?window=demo surface: mock candles + the fixed sample objects.
 *  Delete src/desk/demo/ to remove. */
import { useMemo } from "react";
import { toAnnotations } from "@/desk/layers/adapter";
import type { AnalysisObject } from "@/desk/types/schemas";
import { TF_SECONDS, type Candle, type Pair, type Timeframe } from "@/types/market";
import { AnnotatedChart } from "./AnnotatedChart";

interface Props { pair: Pair; tf: Timeframe; candles: readonly Candle[]; objects: readonly AnalysisObject[]; }

export function DemoChart({ pair, tf, candles, objects }: Props) {
  const until = candles.length > 0 ? candles[candles.length - 1]!.time + TF_SECONDS[tf] : 0;
  const annotations = useMemo(
    () => toAnnotations(objects, { viewTf: tf, until, projected: new Set<string>(), atr: null }),
    [objects, tf, until],
  );
  return <AnnotatedChart pair={pair} tf={tf} candles={candles} annotations={annotations} />;
}
