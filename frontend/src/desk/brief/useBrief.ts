/** DESK DK13 — runs the Desk pipeline for the Brief on the deep sample series (closed bars only, one as-of path).
 *  Price = last closed M5 close; distance scale = H1 ATR. Thesis = objects accepted today (decisionStore). */
import { useEffect, useMemo, useState } from "react";
import { detectAll, marketClass, useAnalysisStore } from "@/desk/detect";
import { decisionsForDay, useDecisionStore } from "@/desk/decisions/decisionStore";
import { runKernel } from "@/desk/kernel/kernel";
import { viewAsOf } from "@/desk/kernel/viewAsOf";
import { useActiveMethodology } from "@/desk/methodology/methodologyStore";
import { deepCandles } from "@/desk/mock/deepMock";
import { useDeskUiStore } from "@/desk/workspace/deskUiStore";
import { utcDateString } from "@/lib/time";
import { useViewStore } from "@/store/viewStore";
import type { AnalysisObject } from "@/desk/types/schemas";
import type { Pair, Timeframe } from "@/types/market";
import { buildBrief, type Brief } from "./buildBrief";
import type { MarketClass } from "@/desk/detect/pa/range";

export const BRIEF_TFS = ["D", "H4", "H1", "M15", "M5"] as const satisfies readonly Timeframe[];
export const BRIEF_DATA_KIND = "sample" as const;

export interface BriefSession {
  brief: Brief;
  objects: AnalysisObject[];
  price: number | null;
  atr: number | null;
  ref: number;
  pair: Pair;
  acceptedIds: ReadonlySet<string>;
}

/** One as-of path for every Live widget (Brief, Change Feed, Readiness): detection is memoised, so repeated calls are cheap. */
export function useBriefSession(): BriefSession | null {
  const pair = useViewStore((s) => s.pair);
  const asOfSel = useDeskUiStore((s) => s.asOf);
  const decisions = useDecisionStore((s) => s.decisions);
  const meth = useActiveMethodology();
  const [ready, setReady] = useState(false);
  useEffect(() => { const t = setTimeout(() => setReady(true), 0); return () => clearTimeout(t); }, []);

  const detected = useMemo(() => {
    if (!ready) return null;
    const asOf = asOfSel === "latest" ? Infinity : asOfSel;
    const objects: AnalysisObject[] = [];
    const trends: Partial<Record<Timeframe, MarketClass>> = {};
    let price: number | null = null;
    let atr: number | null = null;
    let last = 0;
    for (const tf of BRIEF_TFS) {
      const candles = deepCandles(pair, tf);
      const lastBar = candles[candles.length - 1];
      const r = detectAll({ candles, pair, tf, asOf, dataKind: BRIEF_DATA_KIND, dataVersion: `${candles.length}:${lastBar?.time ?? 0}` }, meth.cfg);
      objects.push(...r.objects);
      if (r.lastClose !== null) trends[tf] = marketClass(runKernel(candles, { pair, tf, asOf }, meth.cfg), meth.cfg);
      if (tf === "M5") { price = r.price; last = r.lastClose ?? 0; }
      if (tf === "H1") atr = r.atr;
    }
    const ref = asOfSel === "latest" ? last : Math.min(asOfSel, last || asOfSel);
    return { objects: viewAsOf(objects, ref), trends, price, atr, ref };
  }, [ready, pair, asOfSel, meth]);

  return useMemo(() => {
    if (!detected) return null;
    const day = decisionsForDay(decisions, pair, utcDateString(detected.ref));
    const acceptedIds = new Set([...day.values()].filter((d) => d.action === "accept").map((d) => d.objectId));
    const brief = buildBrief({ pair, asOf: detected.ref, dataKind: BRIEF_DATA_KIND, price: detected.price, atr: detected.atr, objects: detected.objects, trends: detected.trends, acceptedIds });
    return { brief, objects: detected.objects, price: detected.price, atr: detected.atr, ref: detected.ref, pair, acceptedIds };
  }, [detected, decisions, pair]);
}

export function useBrief(): Brief | null {
  return useBriefSession()?.brief ?? null;
}

/** Feeds the evidence drawer with the objects the Brief links to. */
export function usePublishBrief(brief: Brief | null): void {
  useEffect(() => {
    if (!brief) return;
    useAnalysisStore.getState().setAnalysis({ objects: brief.evidence, relations: brief.relations, projected: new Set<string>(), dataKind: brief.dataKind, viewTf: "H1" });
  }, [brief]);
}