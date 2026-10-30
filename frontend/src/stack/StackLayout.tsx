/** S3: the bar above the stack: Focus chip, align-all, and the default-focus rules. */
import { useEffect } from "react";
import { Icon } from "@/components/ui/Icon";
import { usePanelStore } from "@/panels/panelStore";
import { selectActiveSetup, useScanStore } from "@/scan/scanStore";
import { useViewStore } from "@/store/viewStore";
import { formatCrosshairTime, resolveTz } from "@/lib/format";
import { TF_SECONDS, type Timeframe } from "@/types/market";
import "@/styles/stack.css";
import { Breadcrumb } from "./Breadcrumb";
import { RowsMenu } from "./RowsMenu";
import { useFocusStore } from "./focusStore";
import { useTimelineStore } from "./timelineStore";

export function focusLabel(open: number, close: number, parentTF: string, tz: string): string {
  const a = formatCrosshairTime(open, tz);
  const b = formatCrosshairTime(close, tz);
  return `Focus: ${a} – ${b} (${parentTF})`;
}

/** `top`: offset below the Overview strip (px), 0 when the strip is hidden. */
export function StackLayout({ top = 0 }: { top?: number } = {}) {
  const focus = useFocusStore((s) => s.focus);
  const detachedCount = useFocusStore((s) => s.detached.size);
  const alignAll = useFocusStore((s) => s.alignAll);
  const timezone = useViewStore((s) => s.timezone);
  const asOf = useViewStore((s) => s.asOf);
  const lastBound = useScanStore((s) => s.bounds?.last ?? null);
  const setup = useScanStore(selectActiveSetup);
  const tz = resolveTz(timezone);

  // the active setup drives the focus (H1 parent); a detached row is not yanked
  useEffect(() => {
    if (!setup) return;
    const open = Math.floor(setup.focus.from / TF_SECONDS.H1) * TF_SECONDS.H1;
    useFocusStore.getState().setFocus({ anchor: setup.focus.from, interval: [open, open + TF_SECONDS.H1], parentTF: "H1", drillDepth: 0 });
  }, [setup]);

  // with no setup and no focus, follow asOf (or the latest bar)
  useEffect(() => {
    if (setup || useFocusStore.getState().focus) return;
    const t = asOf ?? lastBound;
    if (t !== null) useFocusStore.getState().focusAt(t - 1, "H1");
  }, [setup, asOf, lastBound]);

  return (
    <div className="stack-bar" role="toolbar" aria-label="Stack focus" style={top ? { top } : undefined}>
      <span className="stack-focus mono" aria-live="polite">
        {focus ? focusLabel(focus.interval[0], focus.interval[1], focus.parentTF, tz) : "Focus: latest"}
      </span>
      <Breadcrumb />
      <button
        type="button"
        className="resnap align-all"
        onClick={() => {
          useTimelineStore.getState().unlock();
          alignAll();
        }}
        disabled={!focus}
        aria-label={detachedCount > 0 ? `Align all rows to the focus, including ${detachedCount} detached` : "Align all rows to the focus"}
        title="Align all charts to the focus"
      >
        <Icon name="align" /> Align all{detachedCount > 0 ? ` (${detachedCount})` : ""}
      </button>
      <RowsMenu />
    </div>
  );
}

/** Per-row detached marker + re-snap, rendered inside a panel body. */
export function RowResnap({ tf }: { tf: Timeframe }) {
  const stack = usePanelStore((s) => s.layout === "stack");
  const detached = useFocusStore((s) => s.detached.has(tf));
  const resnap = useFocusStore((s) => s.resnap);
  if (!stack || !detached) return null;
  return (
    <button type="button" className="resnap row-resnap" onClick={() => resnap(tf)} aria-label={`Re-snap ${tf} to the focus`}>
      <Icon name="align" /> re-snap
    </button>
  );
}