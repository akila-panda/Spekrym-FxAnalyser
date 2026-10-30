/** F12 — Intelligence Timeline + Replay bar. Shows only entries knowable at the cursor, each labelled
 *  recorded (● live-captured) or reconstructed (◌ rebuilt) in text + glyph. Step Back/Forward always work;
 *  Play is disabled under prefers-reduced-motion (step only). Tokens only; "sample". */
import { useEffect, useMemo } from "react";
import { prefersReducedMotion } from "@/desk/replay/replayClock";
import { counts, isLive, rehydrate, replaySteps, stepAsOf, type TimelineEntry } from "./timeline";
import { useTimelineStore } from "./timelineStore";

const fmt = (t: number) => new Date(t * 1000).toISOString().slice(11, 16) + "Z";
const TICK_MS = 1000;

export function TimelineBar({ entries }: { entries: readonly TimelineEntry[] }) {
  const asOf = useTimelineStore((s) => s.asOf);
  const playing = useTimelineStore((s) => s.playing);
  const setAsOf = useTimelineStore((s) => s.setAsOf);
  const setPlaying = useTimelineStore((s) => s.setPlaying);
  const steps = useMemo(() => replaySteps(entries), [entries]);
  const live = isLive(steps, asOf);
  const visible = rehydrate(entries, live ? null : asOf);
  const c = counts(visible);
  const reduced = prefersReducedMotion();

  useEffect(() => {
    if (!playing) return;
    if (reduced) { setPlaying(false); return; }
    const id = setInterval(() => {
      const cur = useTimelineStore.getState().asOf;
      const next = stepAsOf(steps, cur, 1);
      setAsOf(next);
      if (next === null) setPlaying(false);
    }, TICK_MS);
    return () => clearInterval(id);
  }, [playing, reduced, steps, setAsOf, setPlaying]);

  const play = () => {
    if (reduced) return;
    if (live && steps.length > 0) setAsOf(steps[0] as number);
    setPlaying(true);
  };

  return (
    <footer className="vc-timeline" aria-label="Intelligence timeline">
      <span className="vc-timeline-label">Timeline</span>
      <span className="vc-tl-mode" aria-label="Replay position">{live ? "Live (latest)" : `Replay @ ${fmt(asOf as number)}`}</span>
      <div className="vc-tl-ctl" role="group" aria-label="Replay controls">
        <button type="button" onClick={() => { setPlaying(false); setAsOf(stepAsOf(steps, asOf, -1)); }} disabled={steps.length === 0 || (!live && (asOf as number) <= (steps[0] as number))} aria-label="Step timeline back">◀ Back</button>
        <button type="button" onClick={() => { setPlaying(false); setAsOf(stepAsOf(steps, asOf, 1)); }} disabled={live} aria-label="Step timeline forward">Forward ▶</button>
        {playing
          ? <button type="button" onClick={() => setPlaying(false)} aria-label="Pause replay">⏸ Pause</button>
          : <button type="button" onClick={play} disabled={reduced || steps.length === 0} title={reduced ? "Reduced motion: step only" : "Play"} aria-label="Play replay">▶ Play</button>}
        <button type="button" onClick={() => { setPlaying(false); setAsOf(null); }} disabled={live} aria-label="Back to live">Live</button>
      </div>
      {reduced && <span className="dk-muted">Reduced motion: step only.</span>}
      <ol className="vc-tl-list" aria-label="Timeline events">
        {visible.map((e) => (
          <li key={e.id}>
            <button type="button" className="vc-event" data-origin={e.origin} onClick={() => { setPlaying(false); setAsOf(e.availableAt); }}
              aria-label={`${e.label} at ${fmt(e.t)} — ${e.origin}`}>
              <span aria-hidden="true">{e.origin === "recorded" ? "●" : "◌"}</span> {fmt(e.t)} {e.label}
              <span className="vc-source-state"> {e.origin}</span>
            </button>
          </li>
        ))}
      </ol>
      <span className="vc-source-state" aria-label="Origin counts">{c.recorded} recorded · {c.reconstructed} reconstructed</span>
      <span className="dk-sample">sample</span>
    </footer>
  );
}