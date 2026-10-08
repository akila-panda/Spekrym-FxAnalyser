import { create } from "zustand";
import type { Timeframe } from "@/types/market";
import { defaultLayoutForWidth, type Layout } from "./layouts";

type Restorable = Exclude<Layout, "maximized">;

interface PanelState {
  layout: Layout;
  focused: Timeframe;
  /** Layout to return to when a maximized chart is restored. */
  restoreTo: Restorable;
  /** Timeframes showing only their own annotations (higher-timeframe context projection suppressed). */
  localOnly: ReadonlySet<Timeframe>;
  setLayout: (layout: Layout) => void;
  focus: (tf: Timeframe) => void;
  toggleMaximize: (tf?: Timeframe) => void;
  restore: () => void;
  toggleLocalOnly: (tf: Timeframe) => void;
}

const initial: Restorable = typeof window === "undefined" ? "grid" : defaultLayoutForWidth(window.innerWidth);

export const usePanelStore = create<PanelState>()((set, get) => ({
  layout: initial,
  focused: "M15",
  restoreTo: initial,
  localOnly: new Set<Timeframe>(),
  setLayout: (layout) =>
    set((s) => (layout === "maximized" ? { layout, restoreTo: s.layout === "maximized" ? s.restoreTo : s.layout } : { layout, restoreTo: layout })),
  focus: (focused) => set({ focused }),
  toggleMaximize: (tf) => {
    const s = get();
    if (s.layout === "maximized" && (tf === undefined || tf === s.focused)) set({ layout: s.restoreTo });
    else set({ layout: "maximized", focused: tf ?? s.focused, restoreTo: s.layout === "maximized" ? s.restoreTo : s.layout });
  },
  restore: () => {
    const s = get();
    if (s.layout === "maximized") set({ layout: s.restoreTo });
  },
  toggleLocalOnly: (tf) =>
    set((s) => {
      const next = new Set(s.localOnly);
      if (next.has(tf)) next.delete(tf);
      else next.add(tf);
      return { localOnly: next };
    }),
}));

/** The panel that fills the stage, or null when not maximized. */
export const selectMaximized = (s: PanelState): Timeframe | null => (s.layout === "maximized" ? s.focused : null);