/** S5/W5: hover any row -> one vertical on every row (and, with peers, in every window), snapped per row. */
import { useEffect, useMemo, useRef } from "react";
import type { ChartApi } from "@/chart/chartApi";
import { usePanelStore } from "@/panels/panelStore";
import { createRemoteGuard } from "@/sync/protocol";
import { TF_SECONDS, type Candle, type Timeframe } from "@/types/market";
import { useCursorStore } from "./cursorStore";
import { useStackRows } from "./useStackRows";
import { snapToBar } from "./sharedCrosshair";

export function useSharedCrosshair(api: ChartApi | null, tf: Timeframe, candles: readonly Candle[]): void {
  const stack = usePanelStore((s) => s.layout === "stack");
  const shared = useCursorStore((s) => s.peers > 0);
  const live = useRef(candles);
  live.current = candles;
  const guard = useRef(createRemoteGuard());
  const { visible } = useStackRows();
  // DX2: a row that is not visible takes no part in the shared cursor
  const rowOk = !stack || visible.includes(tf);
  const active = rowOk && (stack || shared);
  // DX4: one time flag on the bottom visible row; every other row keeps the line only.
  const isBottom = visible[visible.length - 1] === tf;
  const flag = !stack || isBottom;

  useEffect(() => {
    api?.setTimeFlag(flag);
  }, [api, flag]);

  useEffect(() => {
    if (!api || !active) return;
    const g = guard.current;
    const show = (time: number | null, source: Timeframe | null) => {
      if (source === tf) return;
      // Outside the stack, only a cursor from another window is drawn; local hovers stay on their own chart.
      if (source !== null && !stack) return;
      if (time === null) {
        g.run(() => api.clearCrosshair());
        return;
      }
      const bars = live.current;
      const i = snapToBar(bars, time, TF_SECONDS[tf]);
      const bar = i === null ? undefined : bars[i];
      if (!bar) g.run(() => api.clearCrosshair());
      else g.run(() => api.setCrosshair(bar.time, bar.close));
    };
    const offCursor = useCursorStore.subscribe((s) => show(s.time, s.source));
    const offMove = api.onCrosshairMove((t) => {
      if (g.active) return;
      const c = useCursorStore.getState();
      if (t === null) c.clear(tf);
      else c.set(t, tf);
    });
    return () => {
      offCursor();
      offMove();
      g.run(() => api.clearCrosshair());
      useCursorStore.getState().clear(tf);
    };
  }, [api, active, stack, tf]);
}

/** DX4: the bar under the shared cursor on a row that is not being hovered, so legends follow the cursor. */
export function useCursorBar(tf: Timeframe, candles: readonly Candle[]): Candle | null {
  const stack = usePanelStore((s) => s.layout === "stack");
  const time = useCursorStore((s) => s.time);
  const source = useCursorStore((s) => s.source);
  return useMemo(() => {
    if (!stack || time === null || source === tf) return null;
    const i = snapToBar(candles, time, TF_SECONDS[tf]);
    return i === null ? null : (candles[i] ?? null);
  }, [stack, time, source, tf, candles]);
}