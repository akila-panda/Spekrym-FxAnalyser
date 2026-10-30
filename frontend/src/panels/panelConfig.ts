import { PANEL_ORDER, TIMEFRAMES, type Timeframe } from "@/types/market";

export interface PanelDef {
  tf: Timeframe;
  /** 1-based keyboard shortcut; empty for chart-only panels (D, W). */
  key: string;
}

/** Grid/focus panels, top-down: H4, H1, M15, M5, M1 (keys 1-5), then chart-only W, D (hidden unless maximized). */
export const PANELS: readonly PanelDef[] = [
  ...PANEL_ORDER.map((tf, i) => ({ tf, key: String(i + 1) })),
  ...TIMEFRAMES.filter((tf) => !PANEL_ORDER.includes(tf)).map((tf) => ({ tf, key: "" })),
];

export const FOCUS_BREAKPOINT_PX = 1280;