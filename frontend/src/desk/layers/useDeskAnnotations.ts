/** DESK DK3 — runs the Desk pipeline for one chart and returns Annotations for usePanelAnnotations(extra).
 *  `series` = the view TF's candles plus any higher TFs to project from (detect high, project low).
 *  Reads Desk's own as-of clock (never viewStore.asOf). Publishes what is drawn to analysisStore for the evidence drawer. */
import { useEffect, useMemo } from "react";
import { buildRelations, detectAll, useAnalysisStore } from "@/desk/detect";
import { useActiveMethodology } from "@/desk/methodology/methodologyStore";
import { useDeskStore } from "@/desk/workspace/deskStore";
import { useDeskUiStore } from "@/desk/workspace/deskUiStore";
import type { Annotation } from "@/types/annotations";
import type { Candle, Pair, Timeframe } from "@/types/market";
import { toAnnotations } from "./adapter";
import { useLayerStore } from "./layerStore";
import { selectForView } from "./projection";

export interface DeskSeries { tf: Timeframe; candles: readonly Candle[] }

export function useDeskAnnotations(
  pair: Pair, viewTf: Timeframe, series: readonly DeskSeries[], dataKind: "sample" | "live" = "sample",
): Annotation[] {
  const asOfSel = useDeskUiStore((s) => s.asOf);
  const complexity = useDeskStore((s) => s.complexity);
  const settings = useLayerStore((s) => s.settings);
  const meth = useActiveMethodology();
  const asOf = asOfSel === "latest" ? Infinity : asOfSel;

  const result = useMemo(() => {
    const all = series.map((s) => {
      const last = s.candles[s.candles.length - 1];
      const r = detectAll({ candles: s.candles, pair, tf: s.tf, asOf, dataKind, dataVersion: `${s.candles.length}:${last?.time ?? 0}` }, meth.cfg);
      return { tf: s.tf, r };
    });
    const view = all.find((a) => a.tf === viewTf)?.r;
    const sel = selectForView({
      objects: all.flatMap((a) => a.r.objects), viewTf, asOf, settings, complexity,
      price: view?.price ?? null, atrView: view?.atr ?? null,
    });
    const until = Math.min(asOf, view?.lastClose ?? 0);
    return { sel, relations: buildRelations(sel.objects), until, atr: view?.atr ?? null };
  }, [series, pair, viewTf, asOf, dataKind, settings, complexity, meth]);

  useEffect(() => {
    useAnalysisStore.getState().setAnalysis({
      objects: result.sel.objects, relations: result.relations, projected: result.sel.projected, dataKind, viewTf,
    });
  }, [result, dataKind, viewTf]);

  return useMemo(
    () => toAnnotations(result.sel.objects, { viewTf, until: result.until, projected: result.sel.projected, atr: result.atr }),
    [result, viewTf],
  );
}