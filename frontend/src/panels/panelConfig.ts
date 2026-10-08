import { PANEL_ORDER, type Timeframe } from "@/types/market";

export interface PanelDef {
  tf: Timeframe;
  /** 1-based keyboard shortcut. */
  key: string;
}

/** The five panels, top-down: H4, H1, M15, M5, M1. */
export const PANELS: readonly PanelDef[] = PANEL_ORDER.map((tf, i) => ({ tf, key: String(i + 1) }));

export const FOCUS_BREAKPOINT_PX = 1280;