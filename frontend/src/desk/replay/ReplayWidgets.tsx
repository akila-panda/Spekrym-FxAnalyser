/** DESK DK18 — Replay transport, Evidence Timeline and the as-of readout.
 *  Replay moves deskUiStore.asOf only; every consumer reads it through viewAsOf. Real labelled buttons, glyph + text status,
 *  reduced motion = step only (Play disabled, no animation). No new colours. */
import { useEffect, useMemo, useState } from "react";
import { useBriefSession } from "@/desk/brief/useBrief";
import { useDecisionStore } from "@/desk/decisions/decisionStore";
import { fmtTime } from "@/desk/evidence/describe";
import { showObject } from "@/desk/live/useLive";
import { useDeskUiStore } from "@/desk/workspace/deskUiStore";
import { useViewStore } from "@/store/viewStore";
import { closeTimes, positionOf, prefersReducedMotion, scrubTo, SPEEDS, STEP_TFS, tickMs, type Speed, type StepTf } from "./replayClock";
import { pauseReplay, playReplay, stepReplay, tickReplay, toLatest, useReplayStore } from "./replayStore";
import { buildTimeline } from "./timeline";
import "@/styles/desk-replay.css";

export function ReplayBody() {
  const pair = useViewStore((s) => s.pair);
  const asOf = useDeskUiStore((s) => s.asOf);
  const setAsOf = useDeskUiStore((s) => s.setAsOf);
  const { playing, speed, stepTf, setSpeed, setStepTf } = useReplayStore();
  const reduced = prefersReducedMotion();
  const times = useMemo(() => closeTimes(pair, stepTf), [pair, stepTf]);
  const index = positionOf(times, asOf);
  const atLatest = asOf === "latest";
  const at = times[index];

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => tickReplay(pair), tickMs(speed));
    return () => clearInterval(id);
  }, [playing, speed, pair, stepTf]);
  useEffect(() => () => pauseReplay(), []);

  return (
    <div className="dk-replay">
      <p className="dk-muted" role="status">
        <span className="dk-sample">sample</span> {atLatest ? "Showing the latest closed bar." : `Replaying as of ${fmtTime(at as number)}.`}
        {reduced ? " Reduced motion: step only." : ""}
      </p>
      <div className="dk-replay-bar" role="group" aria-label="Replay controls">
        <button type="button" onClick={() => stepReplay(pair, -1)} disabled={!atLatest && index <= 0} aria-label="Step back one bar">◀ Step</button>
        {playing
          ? <button type="button" onClick={pauseReplay} aria-label="Pause replay">❚❚ Pause</button>
          : <button type="button" onClick={() => playReplay(pair)} disabled={reduced} title={reduced ? "Reduced motion: step only" : "Play"} aria-label="Play replay">▶ Play</button>}
        <button type="button" onClick={() => stepReplay(pair, 1)} disabled={atLatest} aria-label="Step forward one bar">Step ▶</button>
        <button type="button" onClick={toLatest} disabled={atLatest} aria-label="Return to latest">Latest ⤓</button>
      </div>
      <label className="dk-replay-row">Position
        <input type="range" min={0} max={times.length - 1} value={index} aria-label="Replay position"
          aria-valuetext={atLatest ? "Latest" : fmtTime(at as number)}
          onChange={(e) => { pauseReplay(); setAsOf(scrubTo(times, Number(e.target.value))); }} />
      </label>
      <div className="dk-replay-row">
        <label>Step
          <select value={stepTf} onChange={(e) => setStepTf(e.target.value as StepTf)} aria-label="Replay step timeframe">
            {STEP_TFS.map((tf) => <option key={tf} value={tf}>{tf}</option>)}
          </select>
        </label>
        <div className="dk-seg" role="group" aria-label="Replay speed">
          {SPEEDS.map((s: Speed) => <button key={s} type="button" aria-pressed={speed === s} onClick={() => setSpeed(s)}>{s}×</button>)}
        </div>
      </div>
    </div>
  );
}

export function EvidenceTimelineBody() {
  const session = useBriefSession();
  const decisions = useDecisionStore((s) => s.decisions);
  const selectedId = useDeskUiStore((s) => s.selectedObjectId);
  const select = useDeskUiStore((s) => s.select);
  const [onlySelected, setOnlySelected] = useState(false);
  const entries = useMemo(
    () => (session ? buildTimeline({ objects: session.objects, decisions: decisions.filter((d) => d.pair === session.pair), ref: session.ref, selectedId: onlySelected ? selectedId : null }) : []),
    [session, decisions, onlySelected, selectedId],
  );
  if (!session) return <p className="dk-muted" aria-busy="true">Loading timeline…</p>;
  const open = (id: string) => { showObject(session.objects, id, session.brief.dataKind); select(id); };
  return (
    <div className="dk-timeline">
      <p className="dk-muted"><span className="dk-sample">{session.brief.dataKind}</span> Facts known by {fmtTime(session.ref)} — nothing later is shown.</p>
      <button type="button" aria-pressed={onlySelected} disabled={!selectedId} onClick={() => setOnlySelected(!onlySelected)}>Selected object only</button>
      {entries.length === 0
        ? <p className="dk-muted">No facts in this window — step the replay later or clear the object filter.</p>
        : (
          <ol className="dk-timeline-list" aria-label="Evidence timeline">
            {entries.map((e) => (
              <li key={e.id} data-kind={e.kind}>
                <button type="button" className="dk-conf-row" onClick={() => open(e.objectId)} aria-label={`Show evidence: ${e.text}`}>
                  <time dateTime={new Date(e.t * 1000).toISOString()}>{fmtTime(e.t)}</time>
                  <span>{e.text}</span>
                </button>
              </li>
            ))}
          </ol>
        )}
    </div>
  );
}

/** Always visible (in the Desk shell) while the as-of is not "latest". */
export function AsOfBadge() {
  const asOf = useDeskUiStore((s) => s.asOf);
  if (asOf === "latest") return null;
  return (
    <div className="dk-asof" role="status" aria-label="As-of">
      <span aria-hidden="true">⏱</span> As of {fmtTime(asOf)} — nothing later is drawn
      <button type="button" onClick={toLatest}>Return to latest</button>
    </div>
  );
}