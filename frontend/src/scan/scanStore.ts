import { create } from "zustand";
import { useAnnotationStore } from "@/store/annotationStore";
import { useViewStore } from "@/store/viewStore";
import { PANEL_ORDER, type Timeframe } from "@/types/market";
import type { ParamValue, ScanResult, Setup, StrategyDef } from "@/types";
import type { ChipState } from "@/components/panel/PanelHeader";
import { rangeEquals, type DataBounds, type DateRange } from "./dateRange";
import { defaultValues, resetOne, type ParamValues } from "./paramState";
import { DEFAULT_FILTERS, type SetupFilters, type Tab } from "./selectors";

export type PanelScanStatus = "idle" | "running" | "done" | "error" | "unsupported";

export interface PanelScan {
  status: PanelScanStatus;
  /** Inputs changed since this result was produced. The result is kept, not cleared. */
  stale: boolean;
  result?: ScanResult;
  error?: string;
  /** Why the chart is unsupported, and what to do. */
  reason?: string;
  chosenSetupId?: string;
}

/** The one setup all five charts show. */
export interface ActiveSetup {
  tf: Timeframe;
  id: string;
}

export type CatalogStatus = "idle" | "loading" | "ready" | "error";

interface ScanState {
  strategies: readonly StrategyDef[];
  catalog: CatalogStatus;
  catalogError?: string;
  strategyId: string | null;
  params: ParamValues;
  range: DateRange | null;
  bounds: DataBounds | null;
  panels: Record<Timeframe, PanelScan>;
  tab: Tab;
  filters: SetupFilters;
  active: ActiveSetup | null;
  /** Bumps whenever a shared input changes. The runner cancels in-flight scans on a bump. */
  inputsVersion: number;

  setCatalogStatus: (status: CatalogStatus, error?: string) => void;
  setCatalog: (list: readonly StrategyDef[]) => void;
  selectStrategy: (id: string) => void;
  setParam: (key: string, value: ParamValue) => void;
  resetParam: (key: string) => void;
  resetParams: () => void;
  setRange: (range: DateRange) => void;
  setBounds: (bounds: DataBounds | null) => void;
  markStale: () => void;
  begin: (tf: Timeframe) => void;
  finish: (tf: Timeframe, result: ScanResult) => void;
  fail: (tf: Timeframe, message: string) => void;
  /** Makes a setup active (annotations on all charts). Does not move the charts. */
  chooseSetup: (tf: Timeframe, id: string | null) => void;
  /** Makes a setup active and moves the charts to its time. */
  activate: (tf: Timeframe, id: string) => void;
  setTab: (tab: Tab) => void;
  setFilters: (patch: Partial<SetupFilters>) => void;
  resetFilters: () => void;
  reset: () => void;
}

const idle = (): PanelScan => ({ status: "idle", stale: false });
const freshPanels = (): Record<Timeframe, PanelScan> => ({ M1: idle(), M5: idle(), M15: idle(), H1: idle(), H4: idle() });

const unsupportedReason = (def: StrategyDef): string =>
  `Not supported by ${def.name}. Scan ${def.supported_timeframes.join(", ")} instead.`;

/** Re-derives every panel after a shared input changed. Results are marked stale, never cleared. */
function restale(panels: Record<Timeframe, PanelScan>, def: StrategyDef | undefined): Record<Timeframe, PanelScan> {
  const out = { ...panels };
  for (const tf of PANEL_ORDER) {
    const p = panels[tf];
    if (def && !def.supported_timeframes.includes(tf)) {
      out[tf] = { status: "unsupported", stale: false, reason: unsupportedReason(def) };
    } else if (p.status === "unsupported") {
      out[tf] = idle();
    } else if (p.status === "running") {
      out[tf] = p.result ? { ...p, status: "done", stale: true } : { status: "idle", stale: false };
    } else if (p.status === "done" && p.result) {
      out[tf] = { ...p, stale: true };
    }
  }
  return out;
}

const defOf = (s: Pick<ScanState, "strategies" | "strategyId">): StrategyDef | undefined =>
  s.strategies.find((x) => x.id === s.strategyId);

/** The active setup survives only while its result is still held by its panel. */
function keepActive(panels: Record<Timeframe, PanelScan>, active: ActiveSetup | null): ActiveSetup | null {
  if (!active) return null;
  return panels[active.tf].result?.setups.some((x) => x.id === active.id) ? active : null;
}

const bump = (s: ScanState, patch: Partial<ScanState>): Partial<ScanState> => {
  const panels = restale(s.panels, defOf({ strategies: patch.strategies ?? s.strategies, strategyId: patch.strategyId ?? s.strategyId }));
  return { ...patch, panels, active: keepActive(panels, s.active), inputsVersion: s.inputsVersion + 1 };
};

const initial = {
  strategies: [] as readonly StrategyDef[],
  catalog: "idle" as CatalogStatus,
  catalogError: undefined,
  strategyId: null,
  params: {} as ParamValues,
  range: null,
  bounds: null,
  panels: freshPanels(),
  tab: "all" as Tab,
  filters: DEFAULT_FILTERS,
  active: null,
  inputsVersion: 0,
};

export const useScanStore = create<ScanState>()((set, get) => ({
  ...initial,

  setCatalogStatus: (catalog, catalogError) => set({ catalog, catalogError }),
  setCatalog: (list) =>
    set((s) => {
      const keep = list.find((x) => x.id === s.strategyId) ?? list[0];
      if (!keep) return { strategies: list, catalog: "ready", catalogError: undefined };
      const same = keep.id === s.strategyId;
      return bump(s, {
        strategies: list,
        catalog: "ready",
        catalogError: undefined,
        strategyId: keep.id,
        params: same ? s.params : defaultValues(keep.params),
      });
    }),
  selectStrategy: (id) =>
    set((s) => {
      const def = s.strategies.find((x) => x.id === id);
      if (!def || id === s.strategyId) return {};
      return bump(s, { strategyId: id, params: defaultValues(def.params) });
    }),
  setParam: (key, value) => set((s) => bump(s, { params: { ...s.params, [key]: value } })),
  resetParam: (key) =>
    set((s) => {
      const def = defOf(s);
      return def ? bump(s, { params: resetOne(def.params, s.params, key) }) : {};
    }),
  resetParams: () =>
    set((s) => {
      const def = defOf(s);
      return def ? bump(s, { params: defaultValues(def.params) }) : {};
    }),
  setRange: (range) => set((s) => (rangeEquals(s.range, range) ? {} : bump(s, { range }))),
  setBounds: (bounds) => set({ bounds }),
  markStale: () => set((s) => bump(s, {})),

  begin: (tf) =>
    set((s) => ({ panels: { ...s.panels, [tf]: { ...s.panels[tf], status: "running", stale: false, error: undefined } } })),
  finish: (tf, result) =>
    set((s) => {
      const prev = s.panels[tf];
      const stillThere = result.setups.some((x) => x.id === prev.chosenSetupId);
      const panels = {
        ...s.panels,
        [tf]: { status: "done" as const, stale: false, result, chosenSetupId: stillThere ? prev.chosenSetupId : undefined },
      };
      return { panels, active: keepActive(panels, s.active) };
    }),
  fail: (tf, message) =>
    set((s) => ({ panels: { ...s.panels, [tf]: { ...s.panels[tf], status: "error", stale: false, error: message } } })),
  chooseSetup: (tf, id) => {
    const p = get().panels[tf];
    const setup = id === null ? undefined : p.result?.setups.find((x) => x.id === id);
    set((s) => ({
      panels: { ...s.panels, [tf]: { ...s.panels[tf], chosenSetupId: setup?.id } },
      active: setup ? { tf, id: setup.id } : s.active?.tf === tf ? null : s.active,
    }));
  },
  activate: (tf, id) => {
    get().chooseSetup(tf, id);
    const st = get();
    const setup = st.active ? st.panels[st.active.tf].result?.setups.find((x) => x.id === st.active?.id) : undefined;
    if (!setup) return;
    // When charts are unlinked, selecting a setup still paints its annotations but leaves each chart where it is.
    if (!useViewStore.getState().linked) return;
    const target = setup.focus.to + 3600;
    const last = st.bounds?.last;
    useViewStore.getState().setAsOf(last !== null && last !== undefined && target >= last ? null : target);
  },
  setTab: (tab) => set({ tab }),
  setFilters: (patch) => set((s) => ({ filters: { ...s.filters, ...patch } })),
  resetFilters: () => set({ filters: DEFAULT_FILTERS }),
  reset: () => set({ ...initial, panels: freshPanels() }),
}));

// Pair is a shared input owned by the view store: a change marks results stale.
useViewStore.subscribe((s, prev) => {
  if (s.pair !== prev.pair) useScanStore.getState().markStale();
});

export const selectActiveSetup = (s: Pick<ScanState, "active" | "panels">): Setup | undefined =>
  s.active ? s.panels[s.active.tf].result?.setups.find((x) => x.id === s.active?.id) : undefined;

// The active setup drives the annotation store, so every chart draws the same picture.
useScanStore.subscribe((s, prev) => {
  const next = selectActiveSetup(s);
  if (next === selectActiveSetup(prev)) return;
  useAnnotationStore.getState().setSetup(next ? { annotations: next.annotations, steps: next.steps } : null);
});

export const selectStrategyDef = (s: ScanState): StrategyDef | undefined => defOf(s);

export const selectSupportedCount = (s: ScanState): number => defOf(s)?.supported_timeframes.length ?? 0;

/** Header chip for one panel. Shapes carry the meaning; text is the count or the state name. */
export function panelChip(p: PanelScan): { state: ChipState; text: string } {
  if (p.status === "running") return { state: "scanning", text: "scanning" };
  if (p.status === "unsupported") return { state: "unsupported", text: "not supported" };
  if (p.status === "error") return { state: "error", text: "error" };
  if (p.status === "done" && p.result) {
    const n = p.result.summary.n_valid;
    return p.stale ? { state: "stale", text: `stale · ${n}` } : { state: "done", text: String(n) };
  }
  return { state: "idle", text: "idle" };
}

/** One line under the chart header for states that need explaining, or null. */
export function panelNote(tf: Timeframe, p: PanelScan, range: DateRange | null): string | null {
  if (p.status === "unsupported") return p.reason ?? null;
  if (p.status === "error") return p.error ?? null;
  if (p.status === "done" && p.result) {
    if (p.stale) return "Results are stale: inputs changed. Scan again to refresh.";
    if (p.result.summary.n_valid === 0) {
      const when = range ? ` between ${range.from} and ${range.to}` : "";
      return `No ${tf} setups${when}. Widen the range or loosen the strategy parameters.`;
    }
    return null;
  }
  if (p.status === "idle") return "Pick a strategy, then Scan.";
  return null;
}