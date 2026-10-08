import { useEffect } from "react";
import type { DataSource } from "@/api/dataSource";
import { getDataSource } from "@/api/sourceFactory";
import { clampRange, presetRange, RANGE_PRESETS, validateRange, type DateRange } from "@/scan/dateRange";
import { useScanStore } from "@/scan/scanStore";
import { useViewStore } from "@/store/viewStore";

export function ScanRangePicker({ source }: { source?: DataSource }) {
  const pair = useViewStore((s) => s.pair);
  const range = useScanStore((s) => s.range);
  const bounds = useScanStore((s) => s.bounds);
  const setRange = useScanStore((s) => s.setRange);

  useEffect(() => {
    const ctl = new AbortController();
    (source ?? getDataSource())
      .getBounds(pair, ctl.signal)
      .then((b) => {
        const nb = { first: b.bounds.M1.first, last: b.bounds.M1.last };
        const st = useScanStore.getState();
        st.setBounds(nb);
        const cur = st.range;
        const next = cur ? clampRange(cur, nb) : presetRange(20, nb);
        if (next) st.setRange(next);
      })
      .catch(() => useScanStore.getState().setBounds(null));
    return () => ctl.abort();
  }, [pair, source]);

  const b = bounds ?? { first: null, last: null };
  const error = validateRange(range, b);
  const lo = b.first === null ? undefined : new Date(b.first * 1000).toISOString().slice(0, 10);
  const hi = b.last === null ? undefined : new Date(b.last * 1000).toISOString().slice(0, 10);
  const edit = (patch: Partial<DateRange>) => {
    const base = range ?? { from: hi ?? "", to: hi ?? "" };
    setRange({ ...base, ...patch });
  };

  return (
    <fieldset className="field range-picker">
      <legend>Scan range (UTC)</legend>
      <div className="presets">
        {RANGE_PRESETS.map((d) => (
          <button
            key={d} type="button" disabled={!bounds}
            onClick={() => { const r = presetRange(d, b); if (r) setRange(r); }}
          >
            Last {d}d
          </button>
        ))}
      </div>
      <label>
        From <input type="date" value={range?.from ?? ""} min={lo} max={hi} onChange={(e) => edit({ from: e.target.value })} />
      </label>
      <label>
        To <input type="date" value={range?.to ?? ""} min={lo} max={hi} onChange={(e) => edit({ to: e.target.value })} />
      </label>
      {error && <p className="field-error" role="alert">{error}</p>}
    </fieldset>
  );
}