import { useEffect, useRef, useState } from "react";
import type { DataSource } from "@/api/dataSource";
import { ChartPanel } from "@/components/panel/ChartPanel";
import { useScanStore } from "@/scan/scanStore";
import { OverviewStrip, useOverviewTicks } from "@/stack/OverviewStrip";
import { StackLayout } from "@/stack/StackLayout";
import { FocusStrip } from "@/stack/FocusStrip";
import { useStackRows } from "@/stack/useStackRows";
import { PANEL_ORDER } from "@/types/market";
import { computeRects, STACK_OVERVIEW_PX, stackPlan, type Size } from "./layouts";
import { PANELS } from "./panelConfig";
import { selectMaximized, usePanelStore } from "./panelStore";

interface Props {
  /** Tests inject a source; the app uses the one from `VITE_DATA_SOURCE`. */
  source?: DataSource;
  /** Tests fix the stage size (jsdom does not lay out). */
  size?: Size;
}

function useStageSize(ref: React.RefObject<HTMLDivElement | null>, fixed?: Size): Size {
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (fixed || !el) return;
    const read = () => setSize({ width: Math.floor(el.clientWidth), height: Math.floor(el.clientHeight) });
    read();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, fixed]);
  return fixed ?? size;
}

const isTyping = (t: EventTarget | null): boolean =>
  t instanceof HTMLElement && (t.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(t.tagName));

export function PanelGrid({ source, size: fixedSize }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const size = useStageSize(ref, fixedSize);
  const layout = usePanelStore((s) => s.layout);
  const focused = usePanelStore((s) => s.focused);
  const maximized = usePanelStore(selectMaximized);
  const focus = usePanelStore((s) => s.focus);
  const toggleMaximize = usePanelStore((s) => s.toggleMaximize);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      const st = usePanelStore.getState();
      if (e.key === "Escape") return st.restore();
      if (e.key === "m" || e.key === "M") return st.toggleMaximize();
      const i = Number(e.key) - 1;
      const tf = Number.isInteger(i) ? PANEL_ORDER[i] : undefined;
      if (tf) st.focus(tf);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const rowsView = useStackRows();
  const activeTf = useScanStore((s) => s.active?.tf ?? null);
  const stack = layout === "stack";
  const ovTicks = useOverviewTicks();
  const overview = stack && ovTicks.length > 0;
  const rowsInput = { focusTF: activeTf ?? focused, supported: rowsView.supported, hidden: rowsView.hidden, overview };
  const rects = computeRects(layout, size, focused, stack ? rowsInput : undefined);
  const plan = stack ? stackPlan(size, focused, rowsInput) : [];
  const ready = size.width > 0 && size.height > 0;

  return (
    <div ref={ref} className="panel-grid" data-layout={layout}>
      {overview && <OverviewStrip ticks={ovTicks} />}
      {layout === "stack" && <StackLayout top={overview ? STACK_OVERVIEW_PX : 0} />}
      {layout === "stack" && <FocusStrip />}
      {ready &&
        PANELS.map(({ tf }) => {
          const r = rects[tf];
          // stack: hidden rows (and W) mount nothing
          if (stack && !r) return null;
          const planned = stack ? plan.find((p) => p.tf === tf) : undefined;
          return (
            <div
              key={tf}
              className="panel-slot"
              hidden={!r}
              style={r ? { left: r.x, top: r.y, width: r.width, height: r.height } : undefined}
            >
              <ChartPanel
                tf={tf}
                source={source}
                row={planned ? { cls: planned.cls, demoted: planned.demoted } : undefined}
                focused={focused === tf}
                maximized={maximized === tf}
                onFocus={() => focus(tf)}
                onToggleMaximize={() => toggleMaximize(tf)}
              />
            </div>
          );
        })}
    </div>
  );
}