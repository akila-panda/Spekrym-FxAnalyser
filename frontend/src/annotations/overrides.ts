import { create } from "zustand";
import type { Annotation } from "@/types/annotations";

export interface TradeOverride {
  entry?: number;
  stop?: number;
  target?: number;
}

interface OverrideState {
  /** Per-annotation-id trade edits. The backend values remain the default. */
  trades: Record<string, TradeOverride>;
  setTrade: (id: string, patch: TradeOverride) => void;
  resetTrade: (id: string) => void;
  resetAll: () => void;
}

export const useOverrideStore = create<OverrideState>()((set) => ({
  trades: {},
  setTrade: (id, patch) =>
    set((s) => ({ trades: { ...s.trades, [id]: { ...s.trades[id], ...patch } } })),
  resetTrade: (id) =>
    set((s) => {
      const next = { ...s.trades };
      delete next[id];
      return { trades: next };
    }),
  resetAll: () => set({ trades: {} }),
}));

/** R multiple from entry/stop/target for a direction. null when risk is zero or inputs are missing. */
export function whatIfR(
  direction: "long" | "short",
  entry: number, stop: number, target: number,
): number | null {
  const risk = direction === "long" ? entry - stop : stop - entry;
  const reward = direction === "long" ? target - entry : entry - target;
  if (!(risk > 0)) return null;
  return reward / risk;
}

const isEmpty = (o: TradeOverride): boolean => o.entry === undefined && o.stop === undefined && o.target === undefined;

/** Applies trade overrides to the annotation set; edited trades carry an "(edited)" label suffix. */
export function applyTradeOverrides(
  annotations: readonly Annotation[],
  trades: Record<string, TradeOverride>,
): Annotation[] {
  return annotations.map((a) => {
    if (a.kind !== "trade") return a;
    const o = trades[a.id];
    if (!o || isEmpty(o)) return a;
    const label = a.label ? `${a.label} (edited)` : "(edited)";
    return { ...a, entry: o.entry ?? a.entry, stop: o.stop ?? a.stop, target: o.target ?? a.target, label };
  });
}
