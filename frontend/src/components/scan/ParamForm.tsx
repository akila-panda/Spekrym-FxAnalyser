import { useId } from "react";
import { Icon } from "@/components/ui/Icon";
import type { ParamDef, ParamValue } from "@/types";
import { selectStrategyDef, useScanStore } from "@/scan/scanStore";
import { changedKeys, validateAll } from "@/scan/paramState";

function Control({ def, value, id, errId, invalid, onChange }: {
  def: ParamDef; value: ParamValue; id: string; errId: string; invalid: boolean; onChange: (v: ParamValue) => void;
}) {
  const aria = { id, "aria-invalid": invalid || undefined, "aria-describedby": invalid ? errId : undefined };
  switch (def.type) {
    case "boolean":
      return <input type="checkbox" {...aria} checked={value === true} onChange={(e) => onChange(e.target.checked)} />;
    case "select":
      return (
        <select {...aria} value={String(value)} onChange={(e) => onChange(e.target.value)}>
          {def.options.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      );
    case "time":
      return <input type="time" {...aria} value={String(value)} onChange={(e) => onChange(e.target.value)} />;
    case "number":
    case "integer":
      return (
        <input
          type="number" className="mono" {...aria} value={String(value)}
          min={def.min} max={def.max} step={def.step ?? (def.type === "integer" ? 1 : "any")}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}

/** Generated entirely from the strategy's ParamDefs. No strategy-specific code. */
export function ParamForm() {
  const base = useId();
  const def = useScanStore(selectStrategyDef);
  const values = useScanStore((s) => s.params);
  const setParam = useScanStore((s) => s.setParam);
  const resetParam = useScanStore((s) => s.resetParam);
  const resetParams = useScanStore((s) => s.resetParams);

  if (!def) return <p>Pick a strategy to see its parameters.</p>;
  const errors = validateAll(def.params, values);
  const changed = changedKeys(def.params, values);

  return (
    <form className="param-form" aria-label={`${def.name} parameters`} onSubmit={(e) => e.preventDefault()}>
      {def.params.map((p) => {
        const id = `${base}-${p.key}`;
        const errId = `${id}-err`;
        const err = errors[p.key];
        return (
          <div className="param-row" key={p.key} data-changed={changed.has(p.key)}>
            <label htmlFor={id}>
              {p.label}
              {p.unit ? <span className="unit"> ({p.unit})</span> : null}
            </label>
            <Control def={p} value={values[p.key] ?? p.default} id={id} errId={errId} invalid={!!err} onChange={(v) => setParam(p.key, v)} />
            {changed.has(p.key) && (
              <button type="button" className="icon-btn" aria-label={`Reset ${p.label}`} title="Reset to default" onClick={() => resetParam(p.key)}>
                <Icon name="reset" />
              </button>
            )}
            {p.help && <p className="hint">{p.help}</p>}
            {err && <p className="field-error" id={errId} role="alert">{err}</p>}
          </div>
        );
      })}
      <button type="button" disabled={changed.size === 0} onClick={resetParams}>Reset all</button>
    </form>
  );
}