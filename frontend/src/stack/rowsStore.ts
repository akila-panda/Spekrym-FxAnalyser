/** DX1: row picker state. Window-scoped (class W): not replicated, not in the URL. */
import { create } from "zustand";
import type { Timeframe } from "@/types/market";
import { STACK_ORDER, visibleRows, type RowStrategy } from "./viewportPolicy";

interface RowsState {
  /** User override: the TFs to show. Null = derive from the strategy. */
  visible: ReadonlySet<Timeframe> | null;
  /** Flips one row. A change that would leave no row is ignored. */
  toggle: (tf: Timeframe, strategy: RowStrategy | null | undefined) => void;
  reset: () => void;
}

export const useRowsStore = create<RowsState>()((set, get) => ({
  visible: null,
  toggle: (tf, strategy) => {
    if (!STACK_ORDER.includes(tf)) return;
    const next = new Set(visibleRows(strategy, get().visible));
    if (next.has(tf)) next.delete(tf);
    else next.add(tf);
    if (next.size === 0) return;
    set({ visible: next });
  },
  reset: () => set({ visible: null }),
}));