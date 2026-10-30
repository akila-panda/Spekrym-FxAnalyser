/** W6: detected screens. Window-scoped, never replicated. */
import { create } from "zustand";
import { detectScreens, type DetectStatus, type ScreenInfo } from "./screens";

interface ScreenState {
  phase: "idle" | "detecting" | DetectStatus;
  screens: ScreenInfo[];
  /** Must be called from a user gesture (it may prompt for permission). */
  detect: () => Promise<void>;
}

export const useScreenStore = create<ScreenState>()((set, get) => ({
  phase: "idle",
  screens: [],
  detect: async () => {
    if (get().phase === "detecting") return;
    set({ phase: "detecting" });
    const r = await detectScreens();
    set({ phase: r.status, screens: r.screens });
  },
}));