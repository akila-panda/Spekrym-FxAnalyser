/** S4: attaches the bracket primitive to one lower row of the stack. Renders only a screen-reader summary. */
import { useEffect, useMemo, useRef, useState } from "react";
import { BracketPrimitive, type BracketOpts } from "@/annotations/primitives/BracketPrimitive";
import type { ChartApi } from "@/chart/chartApi";
import { readTokens } from "@/chart/theme";
import { usePanelStore } from "@/panels/panelStore";
import { useViewStore } from "@/store/viewStore";
import { TF_SECONDS, type Candle, type Timeframe } from "@/types/market";
import { bracketsAllowed, buildBrackets } from "./brackets";
import { useFocusStore } from "./focusStore";
import { useStackBarsStore } from "./stackBarsStore";
import { useStackRows } from "./useStackRows";

const EMPTY: BracketOpts = { marks: [], line: "#5a6678", active: "#4ea1ff", text: "#e6edf6", halo: "#0d1016", font: "monospace" };

interface Win {
  from: number;
  to: number;
}

function visibleWindow(r: { from: number; to: number } | null, bars: readonly Candle[], sec: number): Win | null {
  if (!r || bars.length === 0) return null;
  const a = bars[Math.max(0, Math.floor(r.from))] ?? bars[0]!;
  const b = bars[Math.min(bars.length - 1, Math.ceil(r.to))] ?? bars[bars.length - 1]!;
  return { from: a.time, to: b.time + sec };
}

export function StackBrackets({ api, tf, candles }: { api: ChartApi | null; tf: Timeframe; candles: readonly Candle[] }) {
  const stack = usePanelStore((s) => s.layout === "stack");
  const focus = useFocusStore((s) => s.focus);
  const asOf = useViewStore((s) => s.asOf);
  const rows = useStackRows();
  const parentTF = focus?.parentTF ?? null;
  const allowed = parentTF !== null && bracketsAllowed(tf, parentTF, rows.visible);
  const parentBars = useStackBarsStore((s) => (parentTF ? s.bars[parentTF] : undefined));
  const [win, setWin] = useState<Win | null>(null);
  const prim = useRef<BracketPrimitive | null>(null);

  useEffect(() => {
    if (!api || !stack) return;
    const p = new BracketPrimitive({ getBars: () => api.getCandles(), barSeconds: TF_SECONDS[tf] }, EMPTY);
    prim.current = p;
    const detach = api.attachPrimitive(p);
    return () => {
      detach();
      prim.current = null;
    };
  }, [api, stack, tf]);

  useEffect(() => {
    if (!api || !stack) return;
    const sec = TF_SECONDS[tf];
    const upd = (r: { from: number; to: number } | null) => {
      const next = visibleWindow(r, candles, sec);
      setWin((prev) => (prev?.from === next?.from && prev?.to === next?.to ? prev : next));
    };
    upd(api.getLogicalRange());
    return api.onLogicalRangeChange(upd);
  }, [api, stack, tf, candles]);

  const brackets = useMemo(() => {
    if (!stack || !allowed || !focus || !parentTF || !win || !parentBars) return [];
    return buildBrackets({
      parentTF, parentBars, childTF: tf, childBars: candles,
      from: win.from, to: win.to, asOf, activeAt: focus.interval[0],
    });
  }, [stack, allowed, focus, parentTF, parentBars, win, tf, candles, asOf]);

  useEffect(() => {
    const p = prim.current;
    if (!p) return;
    const t = readTokens();
    const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || EMPTY.active;
    p.set({
      marks: brackets.map((b) => ({ open: b.open, close: b.close, forming: b.forming, active: b.active, partial: b.count.partial, label: b.label })),
      line: t.muted, active: accent, text: t.text, halo: t.bg, font: t.fontMono,
    });
  }, [api, stack, brackets]);

  if (!stack || brackets.length === 0 || !parentTF) return null;
  const act = brackets.find((b) => b.active);
  return (
    <span className="sr-only">
      {brackets.length} {parentTF} segments{act ? `, active segment holds ${act.count.present} ${tf} candles` : ""}
    </span>
  );
}