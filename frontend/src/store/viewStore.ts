import { create } from "zustand";
import type { TimezoneMode } from "@/lib/format";
import type { Pair } from "@/types/market";

interface ViewState {
  pair: Pair;
  /** UTC seconds the charts end at. `null` = latest available. */
  asOf: number | null;
  timezone: TimezoneMode;
  /** When linked, activating a setup moves and zooms all five charts to it. When off, charts stay put and only annotations update. */
  linked: boolean;
  setPair: (pair: Pair) => void;
  setAsOf: (asOf: number | null) => void;
  setTimezone: (tz: TimezoneMode) => void;
  setLinked: (linked: boolean) => void;
  toggleLinked: () => void;
}

export const useViewStore = create<ViewState>()((set) => ({
  pair: "EUR_USD",
  asOf: null,
  timezone: "utc",
  linked: true,
  setPair: (pair) => set({ pair }),
  setAsOf: (asOf) => set({ asOf }),
  setTimezone: (timezone) => set({ timezone }),
  setLinked: (linked) => set({ linked }),
  toggleLinked: () => set((s) => ({ linked: !s.linked })),
}));