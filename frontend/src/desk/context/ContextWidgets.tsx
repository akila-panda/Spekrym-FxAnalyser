/** DESK DK15 — Economic calendar, Session clock and ADR/volatility widgets. Labels "sample" from provenance;
 *  status uses glyph + text; errors are an inline strip with retry; every control is a labelled button. */
import { useMemo } from "react";
import { fmtTime } from "@/desk/evidence/describe";
import { deepCandles } from "@/desk/mock/deepMock";
import { useViewStore } from "@/store/viewStore";
import { calendarView, impactGlyph } from "./calendar";
import { fmtDuration, sessionClock } from "./sessions";
import { useDeskContext, type ContextState } from "./useContext";
import { volatility } from "./volatility";

function Gate({ s, children }: { s: ContextState; children: (d: Extract<ContextState, { status: "ready" }>["data"]) => JSX.Element }) {
  if (s.status === "loading") return <p className="dk-muted" aria-busy="true">Loading…</p>;
  if (s.status === "error") return <p className="dk-muted" role="alert">Context data unavailable. <button type="button" onClick={s.retry}>Retry</button></p>;
  return children(s.data);
}

const Badge = ({ kind, stale }: { kind: string; stale?: boolean }) => <p className="dk-muted"><span className="dk-sample">{kind}</span>{stale ? " ⚠ stale" : ""}</p>;

export function CalendarBody() {
  const s = useDeskContext();
  const pair = useViewStore((v) => v.pair);
  return (
    <Gate s={s}>{(d) => {
      const cal = d.caps.data.calendar;
      if (cal === "absent") return <p className="dk-muted">Calendar unavailable — no events source connected. High-impact warnings are off.</p>;
      const rows = calendarView(d.events.data, d.now, pair);
      return (
        <div className="dk-ctx">
          <Badge kind={d.events.provenance.kind} stale={d.events.provenance.stale} />
          {cal === "unverified" && <p className="dk-muted">Calendar unverified.</p>}
          {rows.length === 0 ? <p className="dk-muted">No events in the next 24 h.</p> : (
            <ul aria-label="Economic calendar">
              {rows.map((e) => (
                <li key={e.id}>
                  <time dateTime={new Date(e.time * 1000).toISOString()}>{fmtTime(e.time)}</time>{" "}
                  <span aria-label={`${e.impact} impact`}>{impactGlyph(e.impact)} {e.impact}</span> · {e.currency} · {e.title}
                  {e.relevant ? " · this pair" : ""} · {e.state === "upcoming" ? `in ${fmtDuration(e.inSec)}` : "released"}
                  {e.state === "released" && e.actual !== undefined ? ` · actual ${e.actual}` : ""}
                  {e.forecast !== undefined ? ` · forecast ${e.forecast}` : ""}
                </li>
              ))}
            </ul>
          )}
        </div>
      );
    }}</Gate>
  );
}

export function SessionsBody() {
  const s = useDeskContext();
  return (
    <Gate s={s}>{(d) => {
      const c = sessionClock(d.now);
      return (
        <div className="dk-ctx">
          <Badge kind={d.caps.provenance.kind} stale={d.caps.provenance.stale} />
          <p className="dk-muted">Approximate · DST-aware · {fmtTime(c.now)}</p>
          <ul aria-label="Session clock">
            {c.rows.map((r) => (
              <li key={r.name}>
                <span aria-hidden="true">{r.status === "open" ? "●" : r.status === "upcoming" ? "◐" : "○"}</span> <strong>{r.label}</strong> — {r.status}
                {" · "}{r.status === "open" ? `closes in ${fmtDuration(r.changeIn)}` : `opens in ${fmtDuration(r.changeIn)}`}
              </li>
            ))}
          </ul>
          {c.overlaps.map((o) => <p key={o}>{o}</p>)}
        </div>
      );
    }}</Gate>
  );
}

export function VolatilityBody() {
  const s = useDeskContext();
  const pair = useViewStore((v) => v.pair);
  const daily = useMemo(() => deepCandles(pair, "D"), [pair]);
  const h1 = useMemo(() => deepCandles(pair, "H1"), [pair]);
  return (
    <Gate s={s}>{(d) => {
      const v = volatility(pair, daily, h1, d.now);
      const p = (x: number | null, dg = 1) => (x === null ? "—" : `${x.toFixed(dg)} pips`);
      return (
        <div className="dk-ctx">
          <Badge kind="sample" stale={d.caps.provenance.stale} />
          <ul aria-label="ADR and volatility">
            <li>ADR (14 d): {p(v.adrPips)}</li>
            <li>Today so far: {p(v.todayPips)}{v.usedPct !== null ? ` · ${v.usedPct.toFixed(0)}% of ADR` : ""}</li>
            <li>H1 ATR (14): {p(v.atrPips)}{v.atrMult !== null ? ` · ${v.atrMult.toFixed(2)}× ADR` : ""}</li>
          </ul>
          <p className="dk-muted">{v.note}</p>
        </div>
      );
    }}</Gate>
  );
}