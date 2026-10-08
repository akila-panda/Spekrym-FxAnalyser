import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { indexAtOrAfter, type ChartApi } from "@/chart/chartApi";
import { readTokens } from "@/chart/theme";
import { selectActiveSetup, useScanStore } from "@/scan/scanStore";
import type { Annotation } from "@/types/annotations";
import { TF_SECONDS, type Pair, type Timeframe } from "@/types/market";
import { AnnotationManager } from "./AnnotationManager";
import { hitTest } from "./hitTest";
import { useAnnotationStore } from "@/store/annotationStore";
import { useViewStore } from "@/store/viewStore";
import { applyTradeOverrides, useOverrideStore } from "./overrides";
import { hitPin, pinKey, pinMarkers, type Pin } from "./setupPins";
import { visibleAnnotations } from "./visibility";

/** Connects the active setup to one panel: routing, legend toggles, Steps reveal, setup pins, hover. */
export function usePanelAnnotations(
  api: ChartApi | null, tf: Timeframe, pair: Pair, candles: readonly unknown[], pins: readonly Pin[] = [],
  localOnly = false,
) {
  const rawAnnotations = useAnnotationStore((s) => s.annotations);
  const trades = useOverrideStore((s) => s.trades);
  const annotations = useMemo(() => applyTradeOverrides(rawAnnotations, trades), [rawAnnotations, trades]);
  const steps = useAnnotationStore((s) => s.steps);
  const hiddenGroups = useAnnotationStore((s) => s.hiddenGroups);
  const step = useAnnotationStore((s) => s.step);
  const active = useScanStore((s) => s.active);
  const activeKey = active ? pinKey(active.tf, active.id) : null;
  // Local-only suppresses projected context: hide every annotation not native to this chart's timeframe.
  const overrides = useMemo(
    () => (localOnly ? { hide: new Set(annotations.filter((a) => a.source_tf !== tf).map((a) => a.id)) } : undefined),
    [localOnly, annotations, tf],
  );
  const visible = useMemo(
    () => visibleAnnotations({ annotations, steps, panelTf: tf, hiddenGroups, step, overrides }),
    [annotations, steps, tf, hiddenGroups, step, overrides],
  );
  const markers = useMemo(() => {
    const t = readTokens();
    return pinMarkers(pins, activeKey, { up: t.up, down: t.down, muted: t.muted });
  }, [pins, activeKey]);

  const manager = useRef<AnnotationManager | null>(null);
  useEffect(() => {
    if (!api) return;
    const m = new AnnotationManager(api, tf);
    manager.current = m;
    return () => {
      m.dispose();
      manager.current = null;
    };
  }, [api, tf]);

  useEffect(() => {
    manager.current?.sync(visible, pair, markers);
  }, [api, tf, visible, pair, candles, markers]);

  const [hover, setHover] = useState<Annotation | null>(null);
  const onMouseMove = (e: MouseEvent<HTMLElement>) => {
    if (!api || visible.length === 0) return;
    const r = e.currentTarget.getBoundingClientRect();
    const hit = hitTest(visible, e.clientX - r.left, e.clientY - r.top, api.coordinates(TF_SECONDS[tf]), r.width);
    setHover((prev) => (prev?.id === hit?.id ? prev : hit));
  };
  const onMouseLeave = () => setHover(null);

  /** Clicking a pin makes its setup active on all charts. */
  const onClick = (e: MouseEvent<HTMLElement>) => {
    if (!api || pins.length === 0) return;
    const r = e.currentTarget.getBoundingClientRect();
    const bars = api.getCandles();
    const pin = hitPin(pins, e.clientX - r.left, e.clientY - r.top, {
      timeX: (t) => api.timeToX(t),
      highY: (t) => {
        const b = bars[indexAtOrAfter(bars, t)];
        return b && b.time === t ? api.priceToY(b.high) : null;
      },
    });
    if (pin) useScanStore.getState().activate(pin.tf, pin.id);
  };

  return { hover, onMouseMove, onMouseLeave, onClick };
}

/** Moves a chart to the active setup once its candles are loaded. Phase 9 gates this behind the Link toggle. */
export function useActiveFocus(api: ChartApi | null, status: "loading" | "ready" | "error", candleCount: number): void {
  const setup = useScanStore(selectActiveSetup);
  const key = useScanStore((s) => (s.active ? pinKey(s.active.tf, s.active.id) : null));
  const linked = useViewStore((s) => s.linked);
  const pending = useRef<string | null>(null);
  useEffect(() => {
    pending.current = key;
  }, [key]);
  useEffect(() => {
    if (!linked || !api || !setup || key === null || pending.current !== key || status !== "ready" || candleCount === 0) return;
    api.focusRange(setup.focus.from, setup.focus.to);
    pending.current = null;
  }, [linked, api, setup, key, status, candleCount]);
}