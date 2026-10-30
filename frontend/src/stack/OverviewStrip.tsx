/** DX9: 24px strip above the stack. One tick per listed setup (▲ long / ▼ short), the focus as a draggable window. Adds no state. */
import { useEffect, useMemo, useRef, useState } from "react";
import { formatInTz } from "@/lib/tz";
import { resolveTz } from "@/lib/format";
import { useReviewLookup } from "@/review/useReviewLookup";
import { rowsFor } from "@/scan/selectors";
import { useScanStore } from "@/scan/scanStore";
import { useViewStore } from "@/store/viewStore";
import { TF_SECONDS } from "@/types/market";
import "@/styles/stack.css";
import { useFocusStore } from "./focusStore";
import { anchorAtX, clusterTicks, overviewRange, pickFromCluster, stepAnchor, ticksFrom, windowRect, type OvTick } from "./overviewMath";

/** Ticks for exactly what the setup list shows (same tab and filters; rejected only when "show rejected" is on). */
export function useOverviewTicks(): OvTick[] {
  const panels = useScanStore((s) => s.panels);
  const tab = useScanStore((s) => s.tab);
  const filters = useScanStore((s) => s.filters);
  const review = useReviewLookup();
  return useMemo(() => ticksFrom(rowsFor(panels, tab, filters, review)), [panels, tab, filters, review]);
}

function useTrackWidth(ref: React.RefObject<HTMLDivElement | null>, fixed?: number): number {
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (fixed !== undefined || !el) return;
    const read = () => setW(Math.floor(el.clientWidth));
    read();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, fixed]);
  return fixed ?? w;
}

export function OverviewStrip({ ticks, width: fixedWidth }: { ticks: readonly OvTick[]; width?: number }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const width = useTrackWidth(trackRef, fixedWidth);
  const activeKey = useScanStore((s) => (s.active ? `${s.active.tf}:${s.active.id}` : null));
  const focus = useFocusStore((s) => s.focus);
  const timezone = useViewStore((s) => s.timezone);
  const tz = resolveTz(timezone);

  const range = useMemo(() => overviewRange(ticks.map((t) => t.t)), [ticks]);
  const clusters = useMemo(() => (range ? clusterTicks(ticks, range, width) : []), [ticks, range, width]);
  const win = range && focus ? windowRect(focus.interval, range, width) : null;
  const parentTF = focus?.parentTF ?? "H1";

  if (!range) return null;

  const moveTo = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return;
    const x = clientX - el.getBoundingClientRect().left;
    useFocusStore.getState().focusAt(anchorAtX(x, range, width), parentTF);
  };

  const label = (t: OvTick) => `${t.dir === "long" ? "Long" : "Short"} setup, ${t.tf}, ${formatInTz(t.t, tz)}`;
  const select = (t: OvTick) => useScanStore.getState().activate(t.tf, t.id);

  return (
    <div className="overview-strip" role="group" aria-label="Scan overview">
      <div
        ref={trackRef}
        className="ov-track"
        data-testid="ov-track"
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest("[data-ov-item]")) return;
          dragging.current = true;
          e.currentTarget.setPointerCapture?.(e.pointerId);
          moveTo(e.clientX);
        }}
        onPointerMove={(e) => dragging.current && moveTo(e.clientX)}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
      >
        <div className="ov-line" aria-hidden="true" />
        {win && focus && (
          <div
            className="ov-window"
            role="slider"
            tabIndex={0}
            aria-label="Focus window"
            aria-valuemin={range[0]}
            aria-valuemax={range[1]}
            aria-valuenow={Math.min(range[1], Math.max(range[0], focus.anchor))}
            aria-valuetext={formatInTz(focus.anchor, tz)}
            style={{ left: win.left, width: win.width }}
            onKeyDown={(e) => {
              const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
              if (!dir) return;
              e.preventDefault();
              useFocusStore.getState().focusAt(stepAnchor(focus.anchor, dir, TF_SECONDS[parentTF], range), parentTF);
            }}
          />
        )}
        {clusters.map((c) => {
          const only = c.items.length === 1 ? c.items[0]! : null;
          if (only) {
            const on = only.key === activeKey;
            return (
              <button
                key={only.key}
                type="button"
                data-ov-item=""
                className="ov-tick"
                data-dir={only.dir}
                aria-current={on ? "true" : undefined}
                aria-label={label(only)}
                title={label(only)}
                style={{ left: c.x }}
                onClick={() => select(only)}
              >
                {only.dir === "long" ? "▲" : "▼"}
              </button>
            );
          }
          const names = `${c.items.length} setups`;
          return (
            <button
              key={c.items[0]!.key}
              type="button"
              data-ov-item=""
              className="ov-cluster mono"
              aria-current={c.items.some((t) => t.key === activeKey) ? "true" : undefined}
              aria-label={`${names}; select next`}
              title={names}
              style={{ left: c.x }}
              onClick={() => select(pickFromCluster(c, activeKey))}
            >
              {c.items.length}
            </button>
          );
        })}
      </div>
    </div>
  );
}