import { useEffect, useRef } from "react";
import { usePanelStore } from "@/panels/panelStore";
import { useScanStore } from "@/scan/scanStore";
import { useViewStore } from "@/store/viewStore";
import { decodeState, encodeState, type ShareState } from "./urlState";

/** Two-way bind of the shareable state to the URL query: restore on mount, then mirror every change via replaceState. */
export function useUrlState(): void {
  const pendingStrategy = useRef<ShareState | null>(null);

  // Restore on mount.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const s = decodeState(window.location.search);
    if (s.pair) useViewStore.getState().setPair(s.pair);
    if (s.tz) useViewStore.getState().setTimezone(s.tz);
    if (s.linked !== undefined) useViewStore.getState().setLinked(s.linked);
    if (s.layout) usePanelStore.getState().setLayout(s.layout);
    if (s.from && s.to) useScanStore.getState().setRange({ from: s.from, to: s.to });
    if (s.strategy || s.params) pendingStrategy.current = s;
    // Strategy/params can only be applied once the catalog has loaded; defer until then.
  }, []);

  // Apply a pending strategy + params once the catalog is ready.
  useEffect(() => {
    const applyPending = (st = useScanStore.getState()) => {
      const p = pendingStrategy.current;
      if (!p || st.catalog !== "ready") return;
      if (p.strategy && st.strategies.some((x) => x.id === p.strategy)) st.selectStrategy(p.strategy);
      for (const [k, v] of Object.entries(p.params ?? {})) st.setParam(k, v);
      pendingStrategy.current = null;
    };
    applyPending();
    return useScanStore.subscribe(applyPending);
  }, []);

  // Mirror state to the URL.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const write = () => {
      const v = useViewStore.getState();
      const p = usePanelStore.getState();
      const sc = useScanStore.getState();
      const query = encodeState({
        pair: v.pair, tz: v.timezone, linked: v.linked, layout: p.layout,
        strategy: sc.strategyId ?? undefined,
        from: sc.range?.from, to: sc.range?.to,
        params: sc.params,
      });
      const next = query ? `${window.location.pathname}?${query}` : window.location.pathname;
      if (next !== window.location.pathname + window.location.search) window.history.replaceState(null, "", next);
    };
    write();
    const unsub = [useViewStore.subscribe(write), usePanelStore.subscribe(write), useScanStore.subscribe(write)];
    return () => unsub.forEach((u) => u());
  }, []);
}
