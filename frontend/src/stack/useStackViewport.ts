/** S3: drives one chart's viewport from the global Focus (stack layout only) and marks the row detached on local pan/zoom. */
import { useEffect, useRef, type RefObject } from "react";
import type { ChartApi } from "@/chart/chartApi";
import { usePanelStore } from "@/panels/panelStore";
import { useViewStore } from "@/store/viewStore";
import type { Candle, Timeframe } from "@/types/market";
import { useFocusStore } from "./focusStore";
import { isTimelineTf, useTimelineStore } from "./timelineStore";
import { createRangeGuard } from "./rangeGuard";
import { deriveViewport } from "./viewportPolicy";

const INTERACTION_MS = 400;

export function useStackViewport(api: ChartApi | null, tf: Timeframe, candles: readonly Candle[], bodyRef: RefObject<HTMLElement | null>): void {
  const stack = usePanelStore((s) => s.layout === "stack");
  const focus = useFocusStore((s) => s.focus);
  const detached = useFocusStore((s) => s.detached.has(tf));
  const timelineOwns = useTimelineStore((s) => s.locked && isTimelineTf(tf));
  const nonce = useFocusStore((s) => s.alignNonce);
  const pair = useViewStore((s) => s.pair);
  const asOf = useViewStore((s) => s.asOf);
  const hasData = candles.length > 0;
  const live = useRef(candles);
  live.current = candles;
  const guard = useRef(createRangeGuard());
  const lastInteraction = useRef(0);

  // follow the focus (not while detached)
  useEffect(() => {
    if (!api || !stack || !focus || detached || !hasData || timelineOwns) return;
    const vp = deriveViewport(tf, focus, live.current);
    if (vp) guard.current.apply(() => api.setLogicalRange(vp.from, vp.to), vp);
  }, [api, stack, focus, detached, hasData, tf, pair, asOf, nonce, timelineOwns]);

  // user interaction on this row detaches it; programmatic echoes are ignored
  useEffect(() => {
    const el = bodyRef.current;
    if (!api || !stack || !el) return;
    const touch = () => { lastInteraction.current = Date.now(); };
    const events = ["pointerdown", "wheel", "touchstart"] as const;
    events.forEach((e) => el.addEventListener(e, touch, { passive: true }));
    const off = api.onLogicalRangeChange((r) => {
      if (!r || guard.current.isEcho(r)) return;
      if (Date.now() - lastInteraction.current > INTERACTION_MS) return;
      if (useTimelineStore.getState().locked && isTimelineTf(tf)) return; // Timeline Sync owns this row
      if (useFocusStore.getState().focus) useFocusStore.getState().setDetached(tf, true);
    });
    return () => {
      events.forEach((e) => el.removeEventListener(e, touch));
      off();
    };
  }, [api, stack, tf, bodyRef]);
}