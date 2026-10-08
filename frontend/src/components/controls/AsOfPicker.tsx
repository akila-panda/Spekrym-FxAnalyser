import { useEffect, useState } from "react";
import { getDataSource } from "@/api/sourceFactory";
import type { DataSource } from "@/api/dataSource";
import { toIsoUtc } from "@/lib/time";
import { useViewStore } from "@/store/viewStore";

const toInput = (sec: number): string => toIsoUtc(sec).slice(0, 16);
const fromInput = (v: string): number | null => {
  const ms = Date.parse(`${v}:00Z`);
  return Number.isNaN(ms) ? null : Math.floor(ms / 1000);
};

interface Bounds { first: number | null; last: number | null }

export function AsOfPicker({ source }: { source?: DataSource }) {
  const pair = useViewStore((s) => s.pair);
  const asOf = useViewStore((s) => s.asOf);
  const setAsOf = useViewStore((s) => s.setAsOf);
  const [bounds, setBounds] = useState<Bounds>({ first: null, last: null });

  useEffect(() => {
    const ctl = new AbortController();
    (source ?? getDataSource())
      .getBounds(pair, ctl.signal)
      .then((b) => setBounds({ first: b.bounds.M1.first, last: b.bounds.M1.last }))
      .catch(() => setBounds({ first: null, last: null }));
    return () => ctl.abort();
  }, [pair, source]);

  const shown = asOf ?? bounds.last;
  return (
    <div className="field as-of">
      <label>
        As of (UTC){" "}
        <input
          type="datetime-local"
          value={shown === null ? "" : toInput(shown)}
          min={bounds.first === null ? undefined : toInput(bounds.first)}
          max={bounds.last === null ? undefined : toInput(bounds.last)}
          onChange={(e) => {
            const v = fromInput(e.target.value);
            if (v !== null) setAsOf(bounds.last !== null && v >= bounds.last ? null : v);
          }}
        />
      </label>
      <button type="button" disabled={asOf === null} onClick={() => setAsOf(null)}>
        Latest
      </button>
    </div>
  );
}