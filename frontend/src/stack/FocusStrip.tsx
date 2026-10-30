/** DX5: one 36px bar under the stack. Navigator, setup phases, step controls and Timeline Sync. Adds no state. */
import { useMemo } from "react";
import { Icon } from "@/components/ui/Icon";
import { StepScrubber } from "@/components/setups/StepScrubber";
import { formatInTz } from "@/lib/tz";
import { useReviewLookup } from "@/review/useReviewLookup";
import { resolveTz } from "@/lib/format";
import { neighbor, rowKey, rowsFor } from "@/scan/selectors";
import { selectActiveSetup, useScanStore } from "@/scan/scanStore";
import { useViewStore } from "@/store/viewStore";
import "@/styles/stack.css";
import { focusSegments, listPosition, segmentAnchor, segmentAt, segmentWeights } from "./focusSegments";
import { useFocusStore } from "./focusStore";
import { TimelineBar } from "./TimelineBar";

export function FocusStrip() {
  const setup = useScanStore(selectActiveSetup);
  const active = useScanStore((s) => s.active);
  const panels = useScanStore((s) => s.panels);
  const tab = useScanStore((s) => s.tab);
  const filters = useScanStore((s) => s.filters);
  const focus = useFocusStore((s) => s.focus);
  const pair = useViewStore((s) => s.pair);
  const asOf = useViewStore((s) => s.asOf);
  const timezone = useViewStore((s) => s.timezone);
  const strategy = active ? panels[active.tf].result?.strategy : undefined;
  const tz = resolveTz(timezone, strategy?.display_tz);

  const review = useReviewLookup();
  const rows = useMemo(() => rowsFor(panels, tab, filters, review), [panels, tab, filters, review]);
  const key = active ? rowKey(active.tf, active.id) : null;
  const pos = listPosition(rows, key);
  const segs = useMemo(() => (setup ? focusSegments(setup) : []), [setup]);
  const weights = segmentWeights(segs);
  const current = segmentAt(segs, focus?.anchor ?? null);

  const go = (dir: 1 | -1) => {
    const next = neighbor(rows, key, dir);
    if (next) useScanStore.getState().activate(next.tf, next.setup.id);
  };

  if (!setup || !active) {
    return (
      <div className="focus-strip" role="group" aria-label="Focus strip">
        <TimelineBar embedded />
      </div>
    );
  }

  return (
    <div className="focus-strip" role="group" aria-label="Focus strip">
      <div className="fs-nav" role="group" aria-label="Setup navigator">
        <button type="button" className="icon-btn" aria-label="Previous setup" title="Previous setup (K)" disabled={!pos || pos.index <= 1} onClick={() => go(-1)}>
          <Icon name="chevron-left" />
        </button>
        <span className="mono fs-pos" aria-label={pos ? `Setup ${pos.index} of ${pos.total}` : "Setup not in the filtered list"}>
          {pos ? `${pos.index} / ${pos.total}` : `– / ${rows.length}`}
        </span>
        <button type="button" className="icon-btn" aria-label="Next setup" title="Next setup (J)" disabled={!pos || pos.index >= pos.total} onClick={() => go(1)}>
          <Icon name="chevron-right" />
        </button>
      </div>
      <p className="fs-title" title={`${pair} · ${strategy?.name ?? ""}`}>
        {pair.replace("_", "/")} · {strategy?.name ?? "—"} · <span className="mono">{formatInTz(setup.focus.from, tz).slice(-5)} → {formatInTz(setup.focus.to, tz).slice(-5)} {tz}</span>
      </p>
      <div className="fs-segs" role="group" aria-label="Setup phases">
        {segs.map((s, i) => {
          const anchor = segmentAnchor(s, asOf);
          return (
            <button
              key={s.key}
              type="button"
              className="fs-seg"
              data-seg={s.key}
              style={{ flexGrow: weights[i] }}
              aria-pressed={current === s.key}
              disabled={anchor === null}
              title={`${s.label}: ${formatInTz(s.from, tz).slice(-5)} → ${formatInTz(s.to, tz).slice(-5)}`}
              onClick={() => anchor !== null && useFocusStore.getState().focusAt(anchor, focus?.parentTF ?? "H1")}
            >
              {s.label}
            </button>
          );
        })}
      </div>
      <div className="fs-steps"><span className="fs-cap">steps</span><StepScrubber compact /></div>
      <TimelineBar embedded />
    </div>
  );
}