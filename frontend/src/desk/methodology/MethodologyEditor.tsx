/** DESK DK17 — My Methodology editor: edit every detector parameter, apply as a new versioned rulesVersion, diff vs defaults,
 *  reset, and re-activate an earlier version. Real labelled controls; validation inline; status in a live region.
 *  Copy is descriptive: parameters are heuristics, not predictions. */
import { useMemo, useState } from "react";
import { fmtTime } from "@/desk/evidence/describe";
import { DEFAULT_RV, useActiveMethodology, useMethodologyStore } from "./methodologyStore";
import { cleanOverrides, paramRows, rulesVersionOf, validateParam, type ParamRow, type ParamValue } from "./params";

const GROUP_LABEL: Record<string, string> = {
  swingN: "Swing strength", swingScaleMult: "Swing scale", atrPeriod: "ATR", dispAtr: "Displacement", dispMaxBars: "Displacement",
  structure: "Structure", levels: "Support / resistance", reference: "Reference levels & sessions", fvg: "FVG", liquidity: "Liquidity",
  supplyDemand: "Supply & demand", priceAction: "Price action",
};
const label = (g: string): string => GROUP_LABEL[g] ?? g;
const unitOf = (p: string): string => /Atr$/.test(p) ? "× ATR" : /Bars?$|Bars[A-Z]/.test(p) || /bars/i.test(p) ? "bars" : p === "reference.roundPips" ? "pips" : /^reference\.sessions\./.test(p) ? "UTC hour" : /Days$/.test(p) ? "days" : "";
const show = (v: ParamValue): string => (typeof v === "boolean" ? (v ? "on" : "off") : String(v));

function Row({ r, onStage }: { r: ParamRow; onStage: (path: string, v: ParamValue | undefined) => void }) {
  const [txt, setTxt] = useState(String(r.value));
  const [err, setErr] = useState<string | null>(null);
  const id = `mp-${r.path}`;
  const unit = unitOf(r.path);
  const stage = (v: ParamValue) => { const e = validateParam(r.path, v); setErr(e); if (!e) onStage(r.path, v); };
  const reset = () => { setTxt(String(r.def)); setErr(null); onStage(r.path, undefined); };
  return (
    <li className="dk-mp-row" data-changed={r.changed}>
      <label htmlFor={id}>{r.path.split(".").slice(1).join(".") || r.path}{unit ? ` (${unit})` : ""}</label>
      {r.spec.kind === "number" && (
        <input id={id} type="number" inputMode="decimal" step={r.spec.int ? 1 : 0.05} value={txt} aria-invalid={err !== null} aria-describedby={err ? `${id}-e` : undefined}
          onChange={(e) => { setTxt(e.target.value); const n = e.target.value.trim() === "" ? NaN : Number(e.target.value); stage(n); }} />
      )}
      {r.spec.kind === "enum" && (
        <select id={id} value={String(r.value)} onChange={(e) => { setTxt(e.target.value); stage(e.target.value); }}>
          {(r.spec.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      )}
      {r.spec.kind === "boolean" && <input id={id} type="checkbox" checked={r.value === true} onChange={(e) => stage(e.target.checked)} />}
      <span className="dk-muted">{r.changed ? `changed ● default ${show(r.def)}` : `default ${show(r.def)}`}</span>
      {r.changed && <button type="button" aria-label={`Reset ${r.path} to default`} onClick={reset}>Reset</button>}
      {err && <span id={`${id}-e`} role="alert" className="dk-mp-err">⚠ {err}</span>}
    </li>
  );
}

export function MethodologyBody() {
  const m = useActiveMethodology();
  const versions = useMethodologyStore((s) => s.versions);
  const { apply, activate, reset } = useMethodologyStore.getState();
  const [staged, setStaged] = useState<Record<string, ParamValue>>({ ...m.overrides });
  const [name, setName] = useState("");
  const [status, setStatus] = useState("");
  const [epoch, setEpoch] = useState(0); // remounts rows after a reset/activate so their inputs resync
  const rows = useMemo(() => paramRows(staged), [staged]);
  const groups = useMemo(() => [...new Set(rows.map((r) => r.group))], [rows]);
  const dirty = rulesVersionOf(cleanOverrides(staged)) !== m.rulesVersion;
  const diff = rows.filter((r) => r.changed);
  const stage = (path: string, v: ParamValue | undefined) => setStaged((s) => { const n = { ...s }; if (v === undefined) delete n[path]; else n[path] = v; return n; });
  const resync = (o: Record<string, ParamValue>) => { setStaged({ ...o }); setEpoch((n) => n + 1); };

  return (
    <div className="dk-mp">
      <p className="dk-muted">Rules version <strong>{m.rulesVersion}</strong>{m.isDefault ? " (defaults)" : " (custom)"} · parameters are heuristics, not predictions. Saved snapshots and journal entries keep the version they were made under.</p>
      <p className="dk-muted">Distances are thresholds in ATR; the UI shows pips. Presentation caps are not part of the methodology.</p>
      <div className="dk-actions">
        <label className="dk-field">Version name <input type="text" aria-label="Version name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} /></label>
        <button type="button" disabled={!dirty} onClick={() => {
          const r = apply(cleanOverrides(staged), name);
          setStatus(r.ok ? (r.changed ? `Applied as new rules version ${r.rulesVersion}.` : "No change.") : r.errors.join(" "));
          if (r.ok) setName("");
        }}>Apply as new version</button>
        <button type="button" disabled={!dirty} onClick={() => { resync({ ...m.overrides }); setStatus("Edits discarded."); }}>Discard edits</button>
        <button type="button" disabled={m.isDefault && !dirty} onClick={() => { reset(); resync({}); setStatus("Reset to defaults."); }}>Reset to defaults</button>
      </div>
      <p role="status" aria-live="polite" className="dk-muted">{status || (dirty ? "Unapplied edits — detection still uses the active version." : "")}</p>

      <section aria-label="Diff vs defaults">
        <h4>Diff vs defaults ({diff.length})</h4>
        {diff.length === 0 ? <p className="dk-muted">Nothing changed from the defaults.</p> : (
          <ul>{diff.map((r) => <li key={r.path}><code>{r.path}</code>: {show(r.def)} → {show(r.value)}</li>)}</ul>
        )}
      </section>

      {groups.map((g) => (
        <details key={g} className="dk-mp-group">
          <summary>{label(g)} <span className="dk-muted">({rows.filter((r) => r.group === g).length})</span></summary>
          <ul key={epoch}>{rows.filter((r) => r.group === g).map((r) => <Row key={`${epoch}:${r.path}`} r={r} onStage={stage} />)}</ul>
        </details>
      ))}

      <section aria-label="Version history">
        <h4>Versions</h4>
        <ul>
          <li>{DEFAULT_RV} · defaults {m.rulesVersion === DEFAULT_RV ? "· active ✓" : <button type="button" aria-label={`Activate defaults ${DEFAULT_RV}`} onClick={() => { activate(DEFAULT_RV); resync({}); setStatus("Defaults activated."); }}>Activate</button>}</li>
          {[...versions].reverse().map((v) => (
            <li key={v.rulesVersion}>
              {v.rulesVersion} · {v.label || "unnamed"} · {Object.keys(v.overrides).length} changes{v.created_at ? ` · ${fmtTime(v.created_at)}` : ""}
              {v.rulesVersion === m.rulesVersion ? " · active ✓" : <button type="button" aria-label={`Activate version ${v.rulesVersion}`} onClick={() => { activate(v.rulesVersion); resync({ ...v.overrides }); setStatus(`Activated ${v.rulesVersion}.`); }}>Activate</button>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}