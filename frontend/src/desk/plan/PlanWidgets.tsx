/** DESK DK16 — Trade plan (Live) and Journal (Review) widgets. Plan: idea / confirmation / invalidation / target R / risk /
 *  linked objects, then "Record decision" freezes evidence + bias + rulesVersion + as-of. Journal: filters, frozen entry,
 *  outcome recorded separately, static text snapshot. Real labelled controls; status in a live region; no buy/sell wording. */
import { useMemo, useState } from "react";
import { useBriefSession, type BriefSession } from "@/desk/brief/useBrief";
import { useActiveMethodology } from "@/desk/methodology/methodologyStore";
import { describeObject, fmtTime } from "@/desk/evidence/describe";
import { PAIRS } from "@/types/market";
import { utcDateString } from "@/lib/time";
import { useJournalStore } from "./journalStore";
import { planFor, usePlanStore } from "./planStore";
import { buildEntry, emptyPlan, entryText, filterJournal, parseTags, type JournalFilter } from "./record";
import { BIASES, RESULTS, type Bias, type JournalEntry, type Plan } from "./types";
import "@/styles/desk-plan.css";

const num = (s: string): number | null => { const n = Number(s); return s.trim() !== "" && Number.isFinite(n) && n > 0 ? n : null; };

function PlanForm({ s, stored }: { s: BriefSession; stored: Plan }) {
  const save = usePlanStore((st) => st.save);
  const add = useJournalStore((st) => st.add);
  const RV = useActiveMethodology().rulesVersion;
  const [p, setP] = useState<Plan>(stored);
  const [bias, setBias] = useState<Bias>("neutral");
  const [tags, setTags] = useState("");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState("");
  const cands = useMemo(() => {
    const m = new Map(s.brief.evidence.map((o) => [o.id, o]));
    for (const o of s.objects) if (s.acceptedIds.has(o.id)) m.set(o.id, o);
    return [...m.values()];
  }, [s]);
  const set = (patch: Partial<Plan>) => setP((x) => ({ ...x, ...patch }));
  const toggle = (id: string) => set({ linkedObjectIds: p.linkedObjectIds.includes(id) ? p.linkedObjectIds.filter((x) => x !== id) : [...p.linkedObjectIds, id] });
  const saveNow = (): Plan => { const next = { ...p, updated_at: Math.floor(Date.now() / 1000) }; save(next); return next; };
  const record = () => {
    const plan = saveNow();
    const r = buildEntry({ plan, bias, briefState: s.brief.label, as_of: s.ref, rulesVersion: RV, dataKind: s.brief.dataKind, objects: s.objects, tags: parseTags(tags), note, recorded_at: Math.floor(Date.now() / 1000) });
    if (!r.ok) { setStatus(r.reason); return; }
    setStatus(add(r.entry) ? "Decision recorded in the Journal (frozen)." : "Already recorded.");
  };
  return (
    <div className="dk-plan">
      <p className="dk-muted"><span className="dk-sample">{s.brief.dataKind}</span> {s.pair.replace("_", "/")} · {p.date} · as-of {fmtTime(s.ref)} · brief: {s.brief.label}</p>
      <label className="dk-field">Idea
        <textarea aria-label="Idea" maxLength={1000} value={p.idea} onChange={(e) => set({ idea: e.target.value })} /></label>
      <label className="dk-field">What would confirm
        <textarea aria-label="What would confirm" maxLength={1000} value={p.confirm} onChange={(e) => set({ confirm: e.target.value })} /></label>
      <label className="dk-field">What would invalidate
        <textarea aria-label="What would invalidate" maxLength={1000} value={p.invalidation} onChange={(e) => set({ invalidation: e.target.value })} /></label>
      <div className="dk-actions">
        <label className="dk-field">Target (R) <input type="number" min="0" step="0.1" aria-label="Target in R" value={p.targetR ?? ""} onChange={(e) => set({ targetR: num(e.target.value) })} /></label>
        <label className="dk-field">Risk (% of account) <input type="number" min="0" step="0.05" aria-label="Risk percent" value={p.riskPct ?? ""} onChange={(e) => set({ riskPct: num(e.target.value) })} /></label>
      </div>
      <fieldset>
        <legend>Linked objects ({p.linkedObjectIds.length})</legend>
        {cands.length === 0 ? <p className="dk-muted">No objects to link — accept levels in Prepare or select an object.</p> : (
          <ul>{cands.map((o) => (
            <li key={o.id}><label className="dk-check"><input type="checkbox" checked={p.linkedObjectIds.includes(o.id)} onChange={() => toggle(o.id)} /> <span>{describeObject(o, "headline").headline}</span></label></li>
          ))}</ul>
        )}
      </fieldset>
      <div className="dk-actions">
        <button type="button" onClick={() => { saveNow(); setStatus("Plan saved."); }}>Save plan</button>
      </div>
      <fieldset>
        <legend>Record decision</legend>
        <div className="dk-actions">
          <label className="dk-field">Bias <select aria-label="Bias" value={bias} onChange={(e) => setBias(e.target.value as Bias)}>{BIASES.map((b) => <option key={b} value={b}>{b}</option>)}</select></label>
          <label className="dk-field">Tags <input type="text" aria-label="Tags" placeholder="e.g. london, sweep" value={tags} onChange={(e) => setTags(e.target.value)} /></label>
        </div>
        <label className="dk-field">Note <input type="text" aria-label="Decision note" maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} /></label>
        <div className="dk-actions"><button type="button" onClick={record}>Record decision</button></div>
        <p className="dk-muted">Freezes the linked evidence, bias, rules version and as-of. The outcome is added later and judged separately.</p>
      </fieldset>
      <p role="status" aria-live="polite" className="dk-muted">{status}</p>
    </div>
  );
}

export function PlanBody() {
  const s = useBriefSession();
  const plans = usePlanStore((st) => st.plans);
  if (!s) return <p className="dk-muted" aria-busy="true">Loading plan…</p>;
  const date = utcDateString(s.ref);
  const stored = planFor(plans, s.pair, date) ?? emptyPlan(s.pair, date, 0);
  return <PlanForm key={`${s.pair}|${date}`} s={s} stored={stored} />;
}

function EntryRow({ e }: { e: JournalEntry }) {
  const outcome = useJournalStore((st) => st.outcomes[e.id]);
  const { setOutcome, clearOutcome } = useJournalStore.getState();
  const [open, setOpen] = useState(false);
  const [res, setRes] = useState<(typeof RESULTS)[number]>(outcome?.result ?? "win");
  const [r, setR] = useState(outcome?.r === null || outcome?.r === undefined ? "" : String(outcome.r));
  const [followed, setFollowed] = useState<"" | "yes" | "no">(outcome?.followedPlan == null ? "" : outcome.followedPlan ? "yes" : "no");
  const [onote, setOnote] = useState(outcome?.note ?? "");
  const [msg, setMsg] = useState("");
  const text = entryText(e, outcome);
  const copy = async () => {
    try { if (!navigator.clipboard) throw new Error("no clipboard"); await navigator.clipboard.writeText(text); setMsg("Snapshot copied."); }
    catch { setMsg("Copy not available here."); }
  };
  const label = `${e.pair.replace("_", "/")} ${e.date} ${e.bias}`;
  return (
    <li className="dk-jr-row">
      <button type="button" className="dk-conf-row" aria-expanded={open} aria-label={`${open ? "Collapse" : "Expand"} entry: ${label}`} onClick={() => setOpen(!open)}>
        <time dateTime={new Date(e.recorded_at * 1000).toISOString()}>{fmtTime(e.recorded_at)}</time>
        <span>{label} · {e.plan.idea.slice(0, 60)}{e.tags.length ? ` · #${e.tags.join(" #")}` : ""} · {outcome ? `outcome: ${outcome.result}` : "no outcome yet"}</span>
      </button>
      {open && (
        <>
          <p className="dk-muted"><span className="dk-sample">{e.dataKind}</span> as-of {fmtTime(e.as_of)} · rules {e.rulesVersion} · frozen</p>
          <pre aria-label={`Decision record: ${label}`}>{text}</pre>
          <fieldset>
            <legend>Outcome (judged separately from the decision)</legend>
            <div className="dk-actions">
              <label className="dk-field">Result <select aria-label="Result" value={res} onChange={(ev) => setRes(ev.target.value as (typeof RESULTS)[number])}>{RESULTS.map((x) => <option key={x} value={x}>{x.replace("_", " ")}</option>)}</select></label>
              <label className="dk-field">R <input type="number" step="0.1" aria-label="Result in R" value={r} onChange={(ev) => setR(ev.target.value)} /></label>
              <label className="dk-field">Followed plan <select aria-label="Followed plan" value={followed} onChange={(ev) => setFollowed(ev.target.value as "" | "yes" | "no")}><option value="">unknown</option><option value="yes">yes</option><option value="no">no</option></select></label>
            </div>
            <label className="dk-field">Outcome note <input type="text" aria-label="Outcome note" maxLength={1000} value={onote} onChange={(ev) => setOnote(ev.target.value)} /></label>
            <div className="dk-actions">
              <button type="button" onClick={() => setMsg(setOutcome(e.id, { result: res, r: r.trim() === "" || !Number.isFinite(Number(r)) ? null : Number(r), followedPlan: followed === "" ? null : followed === "yes", note: onote, set_at: Math.floor(Date.now() / 1000) }) ? "Outcome saved." : "Outcome not saved.")}>Save outcome</button>
              {outcome && <button type="button" onClick={() => { clearOutcome(e.id); setMsg("Outcome cleared."); }}>Clear outcome</button>}
              <button type="button" onClick={copy}>Copy snapshot</button>
            </div>
          </fieldset>
          <p role="status" aria-live="polite" className="dk-muted">{msg}</p>
        </>
      )}
    </li>
  );
}

export function JournalBody() {
  const entries = useJournalStore((st) => st.entries);
  const outcomes = useJournalStore((st) => st.outcomes);
  const [f, setF] = useState<JournalFilter>({});
  const tags = useMemo(() => [...new Set(entries.flatMap((e) => e.tags))].sort(), [entries]);
  const shown = useMemo(() => filterJournal(entries, outcomes, f), [entries, outcomes, f]);
  const upd = (patch: JournalFilter) => setF((x) => ({ ...x, ...patch }));
  return (
    <div className="dk-journal">
      <p className="dk-muted">{entries.some((e) => e.dataKind === "sample") && <span className="dk-sample">sample</span>} Decisions are frozen at the moment they were recorded; outcomes are added separately.</p>
      <div className="dk-jr-filters" role="group" aria-label="Journal filters">
        <label className="dk-field">Pair <select aria-label="Filter pair" value={f.pair ?? ""} onChange={(e) => upd({ pair: e.target.value })}><option value="">all</option>{PAIRS.map((p) => <option key={p} value={p}>{p.replace("_", "/")}</option>)}</select></label>
        <label className="dk-field">Bias <select aria-label="Filter bias" value={f.bias ?? ""} onChange={(e) => upd({ bias: e.target.value as Bias | "" })}><option value="">all</option>{BIASES.map((b) => <option key={b} value={b}>{b}</option>)}</select></label>
        <label className="dk-field">Tag <select aria-label="Filter tag" value={f.tag ?? ""} onChange={(e) => upd({ tag: e.target.value })}><option value="">all</option>{tags.map((t) => <option key={t} value={t}>#{t}</option>)}</select></label>
        <label className="dk-field">Outcome <select aria-label="Filter outcome" value={f.result ?? ""} onChange={(e) => upd({ result: e.target.value as JournalFilter["result"] })}><option value="">all</option><option value="none">none yet</option>{RESULTS.map((x) => <option key={x} value={x}>{x.replace("_", " ")}</option>)}</select></label>
        <label className="dk-field">Search <input type="text" aria-label="Search journal" value={f.text ?? ""} onChange={(e) => upd({ text: e.target.value })} /></label>
      </div>
      {entries.length === 0 ? <p className="dk-muted">No decisions recorded yet — write a plan in Live and choose “Record decision”.</p>
        : shown.length === 0 ? <p className="dk-muted">No entries match — clear a filter.</p>
        : <ul aria-label="Journal entries">{shown.map((e) => <EntryRow key={e.id} e={e} />)}</ul>}
    </div>
  );
}