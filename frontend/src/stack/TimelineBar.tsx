/** Timeline Sync: slider under the stack. Pick a time, press Timeline Sync; every chart (not D) is then pinned to it. */
import { useMemo } from "react";
import { Icon } from "@/components/ui/Icon";
import { formatInTz } from "@/lib/tz";
import { resolveTz } from "@/lib/format";
import { useScanStore } from "@/scan/scanStore";
import { useViewStore } from "@/store/viewStore";
import "@/styles/timeline.css";
import { useFocusStore } from "./focusStore";
import { useStackBarsStore } from "./stackBarsStore";
import { DEFAULT_SPAN, formatSpan, sliderBounds, STEP_SEC } from "./timelineMath";
import { useTimelineStore } from "./timelineStore";

/** `embedded`: rendered inside the Focus strip (no own positioning); behaviour is unchanged. */
export function TimelineBar({ embedded = false }: { embedded?: boolean } = {}) {
  const locked = useTimelineStore((s) => s.locked);
  const anchor = useTimelineStore((s) => s.anchor);
  const draft = useTimelineStore((s) => s.draft);
  const span = useTimelineStore((s) => s.span);
  const setDraft = useTimelineStore((s) => s.setDraft);
  const setAnchor = useTimelineStore((s) => s.setAnchor);
  const sync = useTimelineStore((s) => s.sync);
  const unlock = useTimelineStore((s) => s.unlock);
  const bounds = useScanStore((s) => s.bounds);
  const m1 = useStackBarsStore((s) => s.bars.M1);
  const asOf = useViewStore((s) => s.asOf);
  const timezone = useViewStore((s) => s.timezone);
  const focus = useFocusStore((s) => s.focus);
  const tz = resolveTz(timezone);
  const sb = useMemo(() => sliderBounds(m1 ?? [], bounds, asOf), [m1, bounds, asOf]);

  const fallback = focus ? focus.interval[0] : sb ? sb.max - DEFAULT_SPAN : 0;
  const raw = locked ? (anchor ?? fallback) : (draft ?? fallback);
  const value = sb ? Math.min(sb.max, Math.max(sb.min, raw)) : raw;
  const text = sb ? formatInTz(value, tz) : "no data";

  return (
    <div className={embedded ? "timeline-bar timeline-bar--embedded" : "timeline-bar"} role="group" aria-label="Timeline sync" data-locked={locked}>
      <label className="timeline-label" htmlFor="timeline-slider">Time</label>
      <input
        id="timeline-slider"
        className="timeline-slider"
        type="range"
        min={sb?.min ?? 0}
        max={sb?.max ?? 0}
        step={STEP_SEC}
        value={value}
        disabled={!sb}
        aria-label="Timeline time"
        aria-valuetext={text}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (locked) setAnchor(v);
          else setDraft(v);
        }}
      />
      <span className="timeline-readout mono" aria-live="polite">{text}</span>
      {locked && <span className="timeline-span mono" title="Shared visible width; zoom any chart to change it">span {formatSpan(span)}</span>}
      <button
        type="button"
        className="timeline-btn"
        aria-pressed={locked}
        disabled={!sb}
        onClick={() => (locked ? unlock() : sync(value))}
        title={locked ? "Unlock the charts" : "Align all charts to this time and lock them"}
      >
        {locked ? (
          <>
            <Icon name="dot" size={10} /> Synced · Unlock
          </>
        ) : (
          <>
            <Icon name="ring" size={10} /> Timeline Sync
          </>
        )}
      </button>
    </div>
  );
}