/** Timeline Sync: pins one row's left edge to the shared anchor; zoom changes the shared span; pan snaps back. */
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { ChartApi } from "@/chart/chartApi";
import { usePanelStore } from "@/panels/panelStore";
import { useViewStore } from "@/store/viewStore";
import { TF_SECONDS, type Candle, type Timeframe } from "@/types/market";
import { createRangeGuard } from "./rangeGuard";
import { rangeFor, spanFromRange } from "./timelineMath";
import { isTimelineTf, useTimelineStore } from "./timelineStore";

const INTERACTION_MS = 400;
const SPAN_EPS = 0.02;
const MAX_PAGES = 80;

export interface OlderLoader {
  hasMoreOlder: boolean;
  loadOlder: () => Promise<number>;
}

export function useTimelineViewport(
  api: ChartApi | null, tf: Timeframe, candles: readonly Candle[], bodyRef: RefObject<HTMLElement | null>, loader: OlderLoader,
): void {
  const stack = usePanelStore((s) => s.layout === "stack");
  const locked = useTimelineStore((s) => s.locked);
  const anchor = useTimelineStore((s) => s.anchor);
  const span = useTimelineStore((s) => s.span);
  const pair = useViewStore((s) => s.pair);
  const asOf = useViewStore((s) => s.asOf);
  const active = stack && locked && anchor !== null && isTimelineTf(tf);
  const first = candles[0]?.time;
  const last = candles[candles.length - 1]?.time;

  const live = useRef({ candles, anchor, span, loader });
  live.current = { candles, anchor, span, loader };
  const guard = useRef(createRangeGuard());
  const lastInteraction = useRef(0);

  const apply = useCallback(() => {
    const { candles: bars, anchor: a, span: sp } = live.current;
    if (!api || a === null) return;
    const r = rangeFor(bars, TF_SECONDS[tf], a, sp);
    if (r) guard.current.apply(() => api.setLogicalRange(r.from, r.to), r);
  }, [api, tf]);

  // pin the left edge whenever anchor / span / data change
  useEffect(() => {
    if (active) apply();
  }, [active, apply, anchor, span, first, last, candles.length, pair, asOf]);

  // user zoom -> shared span; user pan -> snap back to the anchor
  useEffect(() => {
    const el = bodyRef.current;
    if (!api || !active || !el) return;
    const touch = () => { lastInteraction.current = Date.now(); };
    const events = ["pointerdown", "wheel", "touchstart"] as const;
    events.forEach((e) => el.addEventListener(e, touch, { passive: true }));
    const off = api.onLogicalRangeChange((r) => {
      if (!r || guard.current.isEcho(r)) return;
      if (Date.now() - lastInteraction.current > INTERACTION_MS) return;
      const next = spanFromRange(r, live.current.candles, TF_SECONDS[tf]);
      const cur = live.current.span;
      if (next !== null && Math.abs(next - cur) / cur > SPAN_EPS) useTimelineStore.getState().setSpan(next);
      else apply();
    });
    return () => {
      events.forEach((e) => el.removeEventListener(e, touch));
      off();
    };
  }, [api, active, tf, bodyRef, apply]);

  // make sure data reaches back to the anchor (loops page by page, capped)
  const [tick, setTick] = useState(0);
  const busy = useRef(false);
  const pages = useRef(0);
  useEffect(() => {
    pages.current = 0;
  }, [anchor, pair]);
  useEffect(() => {
    const { candles: bars, anchor: a, loader: l } = live.current;
    if (!active || a === null || busy.current || !l.hasMoreOlder || bars.length === 0) return;
    if ((bars[0]?.time ?? 0) <= a || pages.current >= MAX_PAGES) return;
    busy.current = true;
    pages.current += 1;
    void l.loadOlder().then((n) => {
      busy.current = false;
      if (n > 0) setTick((t) => t + 1);
    }, () => {
      busy.current = false;
    });
  }, [active, anchor, first, candles.length, tick]);
}