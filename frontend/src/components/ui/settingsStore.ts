/** DX7: theme and density. Window-scoped (class W), persisted to localStorage, never replicated. */
import { create } from "zustand";

export type Theme = "system" | "light" | "dark";
export type Density = "compact" | "comfortable";
interface Persisted {
  theme: Theme;
  density: Density;
}

const KEY = "spekrym.ui.v1";
const DEFAULTS: Persisted = { theme: "system", density: "compact" };
const isTheme = (v: unknown): v is Theme => v === "system" || v === "light" || v === "dark";
const isDensity = (v: unknown): v is Density => v === "compact" || v === "comfortable";

export function loadSettings(): Persisted {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const o = JSON.parse(raw) as Partial<Persisted>;
    return { theme: isTheme(o.theme) ? o.theme : DEFAULTS.theme, density: isDensity(o.density) ? o.density : DEFAULTS.density };
  } catch {
    return DEFAULTS;
  }
}

function save(p: Persisted): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable: setting lasts for this session only */
  }
}

/** `system` removes the attribute so the prefers-color-scheme block in tokens.css decides. */
export function applySettings(p: Persisted, root: HTMLElement = document.documentElement): void {
  if (p.theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", p.theme);
  if (p.density === "comfortable") root.setAttribute("data-density", "comfortable");
  else root.removeAttribute("data-density");
}

interface State extends Persisted {
  /** Bumps when the effective theme may have changed, so charts re-read tokens. */
  epoch: number;
  setTheme: (t: Theme) => void;
  setDensity: (d: Density) => void;
}

const initial = loadSettings();

export const useSettingsStore = create<State>()((set, get) => ({
  ...initial,
  epoch: 0,
  setTheme: (theme) => {
    const next = { theme, density: get().density };
    save(next);
    applySettings(next);
    set({ theme, epoch: get().epoch + 1 });
  },
  setDensity: (density) => {
    const next = { theme: get().theme, density };
    save(next);
    applySettings(next);
    set({ density });
  },
}));

if (typeof document !== "undefined") {
  applySettings(initial);
  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    mq.addEventListener?.("change", () => useSettingsStore.setState((s) => ({ epoch: s.epoch + 1 })));
  }
}