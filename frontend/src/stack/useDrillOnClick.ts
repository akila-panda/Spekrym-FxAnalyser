/** S6: click a candle in the stack -> drill into its span. Pans (pointer moved) and annotation clicks never drill. */
import { useEffect, useRef, type RefObject } from "react";
import { usePanelStore } from "@/panels/panelStore";
import { selectStrategyDef, useScanStore } from "@/scan/scanStore";
import { useViewStore } from "@/store/viewStore";
import type { Timeframe } from "@/types/market";
import { useCursorStore } from "./cursorStore";
import { canDrill, drillChain } from "./drill";
import { useFocusStore } from "./focusStore";
import { useRowsStore } from "./rowsStore";
import { useStackBarsStore } from "./stackBarsStore";
import { useTimelineStore } from "./timelineStore";
import { visibleRows } from "./viewportPolicy";

const MOVE_PX = 4;

export function useDrillOnClick(tf: Timeframe, bodyRef: RefObject<HTMLElement | null>, blocked: boolean): void {
  const stack = usePanelStore((s) => s.layout === "stack");
  const live = useRef(blocked);
  live.current = blocked;

  useEffect(() => {
    const el = bodyRef.current;
    if (!stack || !el) return;
    let down: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY };
    };
    const onClick = (e: MouseEvent) => {
      const d = down;
      down = null;
      if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) > MOVE_PX) return;
      if (live.current) return;
      const c = useCursorStore.getState();
      if (c.source !== tf || c.time === null) return;
      const rows = visibleRows(selectStrategyDef(useScanStore.getState()), useRowsStore.getState().visible);
      if (!canDrill(tf, rows)) return;
      const chain = drillChain(tf, c.time, useStackBarsStore.getState().bars, useViewStore.getState().asOf, rows);
      if (chain.length === 0) return;
      useTimelineStore.getState().unlock();
      useFocusStore.getState().drill(chain);
    };
    el.addEventListener("pointerdown", onDown, { passive: true });
    el.addEventListener("click", onClick);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("click", onClick);
    };
  }, [stack, tf, bodyRef]);
}