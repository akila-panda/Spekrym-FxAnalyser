/** DX11: binds the registry to the real stores. Every action is an existing one; nothing new is stored. */
import { useModeStore } from "@/components/layout/modeStore";
import { openShortcuts } from "@/components/ui/ShortcutsSheet";
import { useDeskStore } from "@/desk/workspace/deskStore";
import { useDeskUiStore } from "@/desk/workspace/deskUiStore";
import { currentReviewLookup } from "@/review/useReviewLookup";
import { formatR, rowsFor } from "@/scan/selectors";
import { resolveTz } from "@/lib/format";
import { formatInTz } from "@/lib/tz";
import { loadPresets, savePreset } from "@/presets/presets";
import { selectStrategyDef, useScanStore } from "@/scan/scanStore";
import { useRowsStore } from "@/stack/rowsStore";
import { STACK_ORDER, visibleRows } from "@/stack/viewportPolicy";
import { useViewStore } from "@/store/viewStore";
import { PAIRS, type Pair } from "@/types/market";
import { applyShareState, captureShareState } from "@/url/shareState";
import { useDockStore } from "@/window/dockStore";
import { openPopout, openWindows, redock } from "@/window/popout";
import { loadBounds } from "@/window/screens";
import { useScreenStore } from "@/window/screenStore";
import { captureWorkspace } from "@/window/workspaces";
import { useWorkspaceStore } from "@/window/workspaceStore";
import type { CommandActions, CommandContext } from "./registry";

/** Snapshot of the state the registry needs. Read once when the palette opens. */
export function readContext(): CommandContext {
  const v = useViewStore.getState();
  const sc = useScanStore.getState();
  const tz = resolveTz(v.timezone);
  const shown = new Set(visibleRows(selectStrategyDef(sc), useRowsStore.getState().visible));
  return {
    pair: v.pair,
    pairs: PAIRS,
    linked: v.linked,
    mode: useModeStore.getState().mode,
    popped: useDockStore.getState().popped,
    setups: rowsFor(sc.panels, sc.tab, sc.filters, currentReviewLookup()).map((r) => ({
      key: r.key,
      tf: r.tf,
      id: r.setup.id,
      label: `${r.setup.direction === "short" ? "▼" : "▲"} ${formatInTz(r.setup.focus.from, tz)} · ${r.tf}${
        r.setup.outcome ? ` · ${formatR(r.setup.outcome.r_multiple)}` : ""
      }`,
    })),
    rowToggles: STACK_ORDER.map((tf) => ({ tf, visible: shown.has(tf) })),
    presets: loadPresets().map((p) => p.name),
    deskApp: useDeskStore.getState().app,
    deskArea: useDeskStore.getState().area,
    deskWorkflow: useDeskStore.getState().workflow,
  };
}

export const actions: CommandActions = {
  setPair: (p) => useViewStore.getState().setPair(p as Pair),
  toggleLinked: () => useViewStore.getState().toggleLinked(),
  togglePopout: (role) => {
    if (useDockStore.getState().popped.has(role)) redock(role);
    else openPopout({ kind: role });
  },
  goToSetup: (ref) => useScanStore.getState().activate(ref.tf, ref.id),
  setMode: (m) => useModeStore.getState().setMode(m),
  toggleRow: (tf) => useRowsStore.getState().toggle(tf, selectStrategyDef(useScanStore.getState())),
  restorePreset: (name) => {
    const p = loadPresets().find((x) => x.name === name);
    if (!p) return;
    applyShareState(p.state);
    if (p.workspace) useWorkspaceStore.getState().restore(p.workspace);
  },
  savePreset: (name) => {
    const ws = useDockStore.getState().popped.size > 0 ? captureWorkspace(openWindows(), useScreenStore.getState().screens, (k) => loadBounds(k)) : undefined;
    savePreset(name, captureShareState(), ws);
  },
  openShortcuts,
  openDeskArea: (area) => { const d = useDeskStore.getState(); d.setApp("desk"); d.setArea(area); },
  backToScan: () => useDeskStore.getState().setApp("scan"),
  setDeskWorkflow: (wf) => useDeskStore.getState().setWorkflow(wf),
  setComplexity: (c) => useDeskStore.getState().setComplexity(c),
  toggleDeskFocus: () => useDeskUiStore.getState().toggleFocus(),
  deskSimplify: () => useDeskUiStore.getState().simplify(),
};