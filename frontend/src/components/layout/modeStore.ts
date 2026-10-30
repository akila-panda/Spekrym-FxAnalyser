/** DX10: current workbench mode and rail collapse state. Window-scoped (class W): mode in the URL, never replicated. */
import { create } from "zustand";
import { usePanelStore } from "@/panels/panelStore";
import { useRailStore } from "./railStore";
import { DEFAULT_MODE, MODE_PRESETS, type Mode } from "./modes";

const AUTO_KEY = "spekrym.autocollapse.v1";

function loadAuto(): boolean {
  try {
    return localStorage.getItem(AUTO_KEY) === "1";
  } catch {
    return false;
  }
}

interface ModeState {
  mode: Mode;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  /** Opt-in, off by default; persisted locally. */
  autoCollapse: boolean;
  /** Applies the mode's preset to the layout, the rails and the open section. */
  setMode: (mode: Mode) => void;
  toggleLeft: () => void;
  toggleRight: () => void;
  collapseRails: () => void;
  setAutoCollapse: (on: boolean) => void;
}

export const useModeStore = create<ModeState>()((set, get) => ({
  mode: DEFAULT_MODE,
  leftCollapsed: false,
  rightCollapsed: false,
  autoCollapse: loadAuto(),
  setMode: (mode) => {
    const p = MODE_PRESETS[mode];
    usePanelStore.getState().setLayout(p.layout);
    useRailStore.getState().setOpen(p.section);
    set({ mode, leftCollapsed: p.leftCollapsed, rightCollapsed: p.rightCollapsed });
  },
  toggleLeft: () => set({ leftCollapsed: !get().leftCollapsed }),
  toggleRight: () => set({ rightCollapsed: !get().rightCollapsed }),
  collapseRails: () => set({ leftCollapsed: true, rightCollapsed: true }),
  setAutoCollapse: (autoCollapse) => {
    try {
      localStorage.setItem(AUTO_KEY, autoCollapse ? "1" : "0");
    } catch {
      /* storage unavailable: lasts for this session only */
    }
    set({ autoCollapse });
  },
}));