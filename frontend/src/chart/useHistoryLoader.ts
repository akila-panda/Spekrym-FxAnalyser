import { useEffect, useRef } from "react";
import type { ChartHandle } from "./useChartInstance";

interface Args {
  handle: ChartHandle | null;
  enabled: boolean;
  loadOlder: () => Promise<number>;
  /** Load when fewer than this many bars remain to the left. */
  threshold?: number;
  debounceMs?: number;
}

/** Calls `loadOlder` (debounced) when the user scrolls close to the oldest loaded bar. */
export function useHistoryLoader({ handle, enabled, loadOlder, threshold = 50, debounceMs = 150 }: Args): void {
  const fn = useRef(loadOlder);
  fn.current = loadOlder;
  useEffect(() => {
    if (!handle || !enabled) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onRange = () => {
      const r = handle.chart.timeScale().getVisibleLogicalRange();
      const info = r ? handle.series.barsInLogicalRange(r) : null;
      if (!info || info.barsBefore >= threshold) return;
      clearTimeout(timer);
      timer = setTimeout(() => void fn.current(), debounceMs);
    };
    handle.chart.timeScale().subscribeVisibleLogicalRangeChange(onRange);
    return () => {
      clearTimeout(timer);
      handle.chart.timeScale().unsubscribeVisibleLogicalRangeChange(onRange);
    };
  }, [handle, enabled, threshold, debounceMs]);
}