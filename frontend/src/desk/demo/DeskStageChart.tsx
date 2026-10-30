/** DEMO (removable) — a real chart for the DESK stage (MY DESK / Analysis), driven by the DESK's own
 *  detectors via useDeskAnnotations, so the Layers panel, complexity and methodology control what is drawn.
 *  Mock candles only. Delete src/desk/demo/ to remove (and the guarded block in DeskRoot's Stage). */
import { useMemo } from "react";
import { useDeskAnnotations, type DeskSeries } from "@/desk/layers/useDeskAnnotations";
import type { Pair, Timeframe } from "@/types/market";
import { demoCandles } from "./demoCandles";
import { AnnotatedChart } from "./AnnotatedChart";
import "@/styles/demo.css";

/** View TF + the higher TFs it projects from (detect high, project low). */
const STACK_FOR: Partial<Record<Timeframe, Timeframe[]>> = {
  H1: ["D", "H4", "H1"],
  M15: ["H4", "H1", "M15"],
  H4: ["W", "D", "H4"],
};

export function DeskStageChart({ pair, viewTf = "H1" }: { pair: Pair; viewTf?: Timeframe }) {
  const tfs = STACK_FOR[viewTf] ?? [viewTf];
  const series: DeskSeries[] = useMemo(() => tfs.map((tf) => ({ tf, candles: demoCandles(pair, tf) })), [pair, viewTf]);
  const candles = useMemo(() => demoCandles(pair, viewTf), [pair, viewTf]);
  const annotations = useDeskAnnotations(pair, viewTf, series, "sample");
  return (
    <div className="demo-stage-fill">
      <AnnotatedChart pair={pair} tf={viewTf} candles={candles} annotations={annotations} />
    </div>
  );
}
