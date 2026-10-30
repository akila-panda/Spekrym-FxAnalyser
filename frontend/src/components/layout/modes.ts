/** DX10: workbench modes. Pure presets of existing state; no new data. */
import type { Layout } from "@/panels/layouts";

export type Mode = "scan" | "investigate" | "review";

export const MODES: readonly Mode[] = ["scan", "investigate", "review"];
export const DEFAULT_MODE: Mode = "scan";
export const MODE_LABELS: Record<Mode, string> = { scan: "Scan", investigate: "Investigate", review: "Review" };
/** Pointer time over the stage before the rails collapse (opt-in setting, Investigate only). */
export const AUTO_COLLAPSE_MS = 1500;

export interface ModePreset {
  layout: Layout;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  /** Right-rail accordion section to open; null = all closed. */
  section: string | null;
}

export const MODE_PRESETS: Record<Mode, ModePreset> = {
  scan: { layout: "grid", leftCollapsed: false, rightCollapsed: false, section: null },
  investigate: { layout: "stack", leftCollapsed: true, rightCollapsed: false, section: "why" },
  review: { layout: "focus", leftCollapsed: true, rightCollapsed: false, section: "conditions" },
};

export const isMode = (v: unknown): v is Mode => typeof v === "string" && (MODES as readonly string[]).includes(v);

export const shouldAutoCollapse = (mode: Mode, enabled: boolean): boolean => enabled && mode === "investigate";