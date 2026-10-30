/** DX4: evidence chips on a context-or-lower row for the selected setup. Hover links to "Why it qualified". */
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { ChipPrimitive, type ChipOpts } from "@/annotations/primitives/ChipPrimitive";
import type { ChartApi } from "@/chart/chartApi";
import { readTokens } from "@/chart/theme";
import { usePanelStore } from "@/panels/panelStore";
import { selectActiveSetup, useScanStore } from "@/scan/scanStore";
import { useAnnotationStore } from "@/store/annotationStore";
import { useViewStore } from "@/store/viewStore";
import { TF_SECONDS, type Candle, type Timeframe } from "@/types/market";
import { buildChips } from "./evidenceChips";
import { useEvidenceStore } from "./evidenceStore";
import { rowRole } from "./rowCaption";

const EMPTY: ChipOpts = { chips: [], highlight: null, accent: "#4ea1ff", text: "#e6edf6", bg: "#0d1016", line: "#5a6678", font: "monospace" };

interface Props {
  api: ChartApi | null;
  tf: Timeframe;
  candles: readonly Candle[];
  bodyRef: RefObject<HTMLDivElement | null>;
}

export function StackEvidence({ api, tf, candles, bodyRef }: Props) {
  const stack = usePanelStore((s) => s.layout === "stack");
  const setup = useScanStore(selectActiveSetup);
  const setupTF = useScanStore((s) => s.active?.tf ?? null);
  const asOf = useViewStore((s) => s.asOf);
  const step = useAnnotationStore((s) => s.step);
  const hover = useEvidenceStore((s) => s.hoverStep);
  // Context rows stay quiet: chips live on the focus row and the detail rows below it.
  const role = rowRole(tf, setupTF);
  const show = stack && setup !== undefined && role !== null && role !== "context";
  const prim = useRef<ChipPrimitive | null>(null);
  const fromChart = useRef(false);
  const [, bump] = useState(0);

  const chips = useMemo(
    () => (show && setup ? buildChips(setup.steps, candles, TF_SECONDS[tf], asOf, step) : []),
    [show, setup, candles, tf, asOf, step],
  );

  useEffect(() => {
    if (!api || !show) return;
    const p = new ChipPrimitive({ getBars: () => api.getCandles(), barSeconds: TF_SECONDS[tf] }, EMPTY);
    prim.current = p;
    const detach = api.attachPrimitive(p);
    bump((n) => n + 1);
    return () => {
      detach();
      prim.current = null;
    };
  }, [api, show, tf]);

  useEffect(() => {
    const p = prim.current;
    if (!p) return;
    const t = readTokens();
    const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || EMPTY.accent;
    p.set({
      chips: chips.map((c) => ({ n: c.n, time: c.time })),
      highlight: hover,
      accent, text: t.text, bg: t.bg, line: t.muted, font: t.fontMono,
    });
  }, [chips, hover, api, show]);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el || !show) return;
    const at = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      return prim.current?.hit(e.clientX - r.left, e.clientY - r.top) ?? null;
    };
    const move = (e: MouseEvent) => {
      const n = at(e);
      if (n !== null) {
        fromChart.current = true;
        useEvidenceStore.getState().setHover(n);
      } else if (fromChart.current) {
        fromChart.current = false;
        useEvidenceStore.getState().setHover(null);
      }
      el.style.cursor = n !== null ? "pointer" : "";
    };
    const leave = () => {
      if (!fromChart.current) return;
      fromChart.current = false;
      useEvidenceStore.getState().setHover(null);
    };
    const click = (e: MouseEvent) => {
      const n = at(e);
      if (n === null) return;
      const a = useAnnotationStore.getState();
      a.setStep(a.step === n ? null : n);
    };
    el.addEventListener("mousemove", move);
    el.addEventListener("mouseleave", leave);
    el.addEventListener("click", click);
    return () => {
      el.removeEventListener("mousemove", move);
      el.removeEventListener("mouseleave", leave);
      el.removeEventListener("click", click);
      el.style.cursor = "";
    };
  }, [bodyRef, show]);

  if (chips.length === 0) return null;
  return <span className="sr-only">{chips.length} evidence steps marked on {tf}</span>;
}