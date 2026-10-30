import { selectStrategyDef, useScanStore } from "@/scan/scanStore";
import { summarizeParams } from "@/scan/paramSummary";
import "@/styles/overflow.css";

/** One-line parameter summary shown while the parameter group is folded. */
export function ParamSummary({ onEdit }: { onEdit: () => void }) {
  const def = useScanStore(selectStrategyDef);
  const values = useScanStore((s) => s.params);
  const stale = useScanStore((s) => Object.values(s.panels).some((p) => p.stale));
  if (!def) return null;
  const m = summarizeParams(def.params, values);
  return (
    <button type="button" className="param-summary" onClick={onEdit} title="Edit parameters">
      <span className="ps-text mono">
        {def.name}
        {m.parts.map((p) => (
          <span key={p.key}>
            {" · "}
            {p.text}
            {p.changed && <span aria-label=" (edited)"> •</span>}
          </span>
        ))}
        {m.more > 0 && <span> · +{m.more}</span>}
      </span>
      {stale && (
        <span className="stale-dot" role="img" aria-label="Inputs changed since the last scan" title="Inputs changed since the last scan">
          ●
        </span>
      )}
      <span className="ps-edit">edit</span>
    </button>
  );
}