import type { PanelScan } from "@/scan/scanStore";
import { PANEL_ORDER, type Timeframe } from "@/types/market";

export interface RunnerTracker {
  /** Feed every incoming scanResults payload. Attributes a chart's "running" state to the window that started it. */
  observe(origin: string, panels: Record<Timeframe, { status: string }>): void;
  orphansOf(origin: string): Timeframe[];
}

export function createRunnerTracker(): RunnerTracker {
  const by = new Map<Timeframe, string>();
  return {
    observe(origin, panels) {
      for (const tf of PANEL_ORDER) {
        if (panels[tf]?.status !== "running") by.delete(tf);
        else if (!by.has(tf)) by.set(tf, origin);
      }
    },
    orphansOf: (origin) => PANEL_ORDER.filter((tf) => by.get(tf) === origin),
  };
}

/**
 * Panels still "running" for a window that vanished: keep any previous result as stale, else go idle.
 * Charts this window is running itself are left alone. Returns null when nothing changes.
 */
export function orphanPatch(
  panels: Record<Timeframe, PanelScan>, tfs: readonly Timeframe[], isLocal: (tf: Timeframe) => boolean,
): Record<Timeframe, PanelScan> | null {
  let next: Record<Timeframe, PanelScan> | null = null;
  for (const tf of tfs) {
    const p = panels[tf];
    if (p.status !== "running" || isLocal(tf)) continue;
    next ??= { ...panels };
    next[tf] = p.result ? { ...p, status: "done", stale: true } : { status: "idle", stale: false };
  }
  return next;
}