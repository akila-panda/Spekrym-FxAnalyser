/** DESK DK3 — per-layer presentation settings (preference class; local only, never replicated).
 *  Persisted at spekrym.desk.layers.v1. Pure parse, try/catch persist, drop-on-corrupt. */
import { create } from "zustand";
import { createLocalStore } from "@/desk/lib/storage";
import { LAYERS, type LayerId } from "@/desk/types/schemas";
import { TIMEFRAMES, type Timeframe } from "@/types/market";
import { CORE_LAYERS, getPreset, type PresetId } from "./layerPresets";

export interface LayerSettings {
  visible: boolean;
  /** null = all timeframes. */
  sourceTfs: Timeframe[] | null;
  /** Bars of the view TF back from as-of; null = unlimited. */
  lookbackBars: number | null;
  /** Hide objects whose grade.significance is below this (objects without a score pass). */
  minSignificance: number;
  /** null = complexity cap only. */
  maxObjects: number | null;
  showTested: boolean;
  /** Mitigated / filled / broken / invalidated. */
  showInvalid: boolean;
  projectFromHtf: boolean;
}

export type LayerSettingsMap = Record<LayerId, LayerSettings>;

export const defaultLayerSettings = (visible: boolean): LayerSettings => ({
  visible, sourceTfs: null, lookbackBars: null, minSignificance: 0, maxObjects: null,
  showTested: true, showInvalid: false, projectFromHtf: true,
});

export const defaultSettingsMap = (): LayerSettingsMap =>
  Object.fromEntries(LAYERS.map((l) => [l, defaultLayerSettings(CORE_LAYERS.includes(l))])) as LayerSettingsMap;

const isTf = (v: unknown): v is Timeframe => typeof v === "string" && (TIMEFRAMES as readonly string[]).includes(v);
const num = (v: unknown, d: number | null): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : d);

export function parseLayerSettings(raw: unknown): LayerSettingsMap {
  const base = defaultSettingsMap();
  if (!raw || typeof raw !== "object") return base;
  const src = (raw as { settings?: Record<string, Partial<LayerSettings>> }).settings ?? {};
  for (const l of LAYERS) {
    const s = src[l];
    if (!s || typeof s !== "object") continue;
    const d = base[l];
    base[l] = {
      visible: typeof s.visible === "boolean" ? s.visible : d.visible,
      sourceTfs: Array.isArray(s.sourceTfs) ? s.sourceTfs.filter(isTf) : null,
      lookbackBars: num(s.lookbackBars, null),
      minSignificance: Math.min(1, num(s.minSignificance, 0) ?? 0),
      maxObjects: num(s.maxObjects, null),
      showTested: typeof s.showTested === "boolean" ? s.showTested : d.showTested,
      showInvalid: typeof s.showInvalid === "boolean" ? s.showInvalid : d.showInvalid,
      projectFromHtf: typeof s.projectFromHtf === "boolean" ? s.projectFromHtf : d.projectFromHtf,
    };
  }
  return base;
}

const store = createLocalStore<LayerSettingsMap>({
  name: "layers", version: 1, parse: parseLayerSettings, empty: defaultSettingsMap,
});

interface LayerState {
  settings: LayerSettingsMap;
  preset: PresetId | null;
  setLayer: (id: LayerId, patch: Partial<LayerSettings>) => void;
  toggle: (id: LayerId) => void;
  applyPreset: (id: PresetId) => void;
  reset: () => void;
}

export const useLayerStore = create<LayerState>()((set) => ({
  settings: store.load(),
  preset: null,
  setLayer: (id, patch) =>
    set((s) => ({ settings: { ...s.settings, [id]: { ...s.settings[id], ...patch } }, preset: "visible" in patch ? null : s.preset })),
  toggle: (id) =>
    set((s) => ({ settings: { ...s.settings, [id]: { ...s.settings[id], visible: !s.settings[id].visible } }, preset: null })),
  applyPreset: (id) =>
    set((s) => {
      const p = getPreset(id);
      if (!p) return s;
      const next = { ...s.settings };
      for (const l of LAYERS) next[l] = { ...(id === "core" ? defaultLayerSettings(false) : next[l]), visible: p.visible.includes(l) };
      return { settings: next, preset: id };
    }),
  reset: () => set({ settings: defaultSettingsMap(), preset: "core" }),
}));

useLayerStore.subscribe((s) => { store.save(s.settings); });

export const selectVisibleCount = (s: { settings: LayerSettingsMap }): number =>
  LAYERS.filter((l) => s.settings[l].visible).length;