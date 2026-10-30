/** W4: which roles are currently popped out of this (main) window. Window-scoped, never replicated. */
import { create } from "zustand";

interface DockState {
  popped: ReadonlySet<string>;
  /** One-line, user-facing problem (e.g. popup blocked). */
  notice: string | null;
  markPopped: (key: string) => void;
  markDocked: (key: string) => void;
  setNotice: (n: string | null) => void;
}

export const useDockStore = create<DockState>()((set) => ({
  popped: new Set<string>(),
  notice: null,
  markPopped: (key) =>
    set((s) => {
      if (s.popped.has(key)) return {};
      const next = new Set(s.popped);
      next.add(key);
      return { popped: next };
    }),
  markDocked: (key) =>
    set((s) => {
      if (!s.popped.has(key)) return {};
      const next = new Set(s.popped);
      next.delete(key);
      return { popped: next };
    }),
  setNotice: (notice) => set({ notice }),
}));