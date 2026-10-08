import { usePanelStore } from "@/panels/panelStore";
import { useScanStore } from "@/scan/scanStore";
import { useViewStore } from "@/store/viewStore";
import type { ShareState } from "./urlState";

/** Snapshots the current shareable state from the three stores. */
export function captureShareState(): ShareState {
  const v = useViewStore.getState();
  const p = usePanelStore.getState();
  const sc = useScanStore.getState();
  return {
    pair: v.pair, tz: v.timezone, linked: v.linked, layout: p.layout,
    strategy: sc.strategyId ?? undefined,
    from: sc.range?.from, to: sc.range?.to, params: sc.params,
  };
}

/** Applies a shareable state to the stores. Strategy/params are applied only when the catalog is ready. */
export function applyShareState(s: ShareState): void {
  if (s.pair) useViewStore.getState().setPair(s.pair);
  if (s.tz) useViewStore.getState().setTimezone(s.tz);
  if (s.linked !== undefined) useViewStore.getState().setLinked(s.linked);
  if (s.layout) usePanelStore.getState().setLayout(s.layout);
  if (s.from && s.to) useScanStore.getState().setRange({ from: s.from, to: s.to });
  const sc = useScanStore.getState();
  if (sc.catalog === "ready") {
    if (s.strategy && sc.strategies.some((x) => x.id === s.strategy)) sc.selectStrategy(s.strategy);
    for (const [k, v] of Object.entries(s.params ?? {})) sc.setParam(k, v);
  }
}
