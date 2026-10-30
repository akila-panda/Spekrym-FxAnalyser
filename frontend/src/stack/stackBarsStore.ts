/** S4: every chart publishes its loaded candles so lower rows can read parent bars (no extra fetches). Window-scoped, not synced. */
import { useEffect } from "react";
import { create } from "zustand";
import type { Candle, Timeframe } from "@/types/market";

interface StackBarsState {
  bars: Partial<Record<Timeframe, readonly Candle[]>>;
  publish: (tf: Timeframe, candles: readonly Candle[]) => void;
  clear: (tf: Timeframe) => void;
}

export const useStackBarsStore = create<StackBarsState>()((set) => ({
  bars: {},
  publish: (tf, candles) =>
    set((s) => (s.bars[tf] === candles ? {} : { bars: { ...s.bars, [tf]: candles } })),
  clear: (tf) =>
    set((s) => {
      if (!(tf in s.bars)) return {};
      const next = { ...s.bars };
      delete next[tf];
      return { bars: next };
    }),
}));

export function usePublishBars(tf: Timeframe, candles: readonly Candle[]): void {
  useEffect(() => {
    useStackBarsStore.getState().publish(tf, candles);
  }, [tf, candles]);
  useEffect(() => () => useStackBarsStore.getState().clear(tf), [tf]);
}