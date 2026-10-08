import { useMemo, useState } from "react";
import type { DataSource } from "@/api/dataSource";
import { selectStrategyDef, useScanStore } from "@/scan/scanStore";
import { useStrategies } from "@/scan/useStrategies";
import { CLASS_LABEL, filterByClass, signalClassOf, type ClassFilter } from "@/scan/filterStrategies";
import "@/styles/picker.css";

const FILTERS: readonly { id: ClassFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "price_only", label: "Price" },
  { id: "hybrid", label: "Hybrid" },
  { id: "indicator", label: "Indicator" },
];

export function StrategyPicker({ source }: { source?: DataSource }) {
  const { strategies, status, error, retry } = useStrategies(source);
  const strategyId = useScanStore((s) => s.strategyId);
  const def = useScanStore(selectStrategyDef);
  const select = useScanStore((s) => s.selectStrategy);
  const [filter, setFilter] = useState<ClassFilter>("all");

  // Keep the current strategy selectable even when it is filtered out.
  const visible = useMemo(() => {
    const list = filterByClass(strategies, filter);
    if (def && !list.some((s) => s.id === def.id)) return [def, ...list];
    return list;
  }, [strategies, filter, def]);

  if (status === "error") {
    return (
      <div role="alert">
        <p>{error}</p>
        <button type="button" onClick={retry}>Retry</button>
      </div>
    );
  }
  if (strategies.length === 0) return <p>Loading strategies…</p>;

  const context = def?.context_timeframes ?? [];
  const indicators = def?.indicators_used ?? [];
  return (
    <div className="field strategy-picker">
      <div className="class-filter" role="group" aria-label="Strategy class">
        {FILTERS.map((f) => (
          <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
            {f.label}
          </button>
        ))}
      </div>
      <label>
        Strategy{" "}
        <select value={strategyId ?? ""} onChange={(e) => select(e.target.value)}>
          {visible.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </label>
      {def && (
        <>
          <p className="hint">{def.description}</p>
          <p className="hint mono">
            {CLASS_LABEL[signalClassOf(def)]} · scans on: {def.supported_timeframes.join(" ")}
            {context.length > 0 && ` · context: ${context.join(" ")}`}
          </p>
          {indicators.length > 0 && (
            <ul className="indicator-chips" aria-label="Indicators used">
              {indicators.map((ind) => (
                <li key={ind} className="chip-pill">{ind}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}