import { useId } from "react";
import { filtersChanged, type DirectionFilter, type OutcomeFilter, type SortKey } from "@/scan/selectors";
import { useScanStore } from "@/scan/scanStore";

export function SetupFilters() {
  const id = useId();
  const f = useScanStore((s) => s.filters);
  const set = useScanStore((s) => s.setFilters);
  const reset = useScanStore((s) => s.resetFilters);
  return (
    <div className="setup-filters" role="group" aria-label="Setup filters">
      <label className="check">
        <input type="checkbox" checked={f.showRejected} onChange={(e) => set({ showRejected: e.target.checked })} /> Show rejected candidates
      </label>
      <div className="filter-grid">
        <label htmlFor={`${id}-dir`}>Direction</label>
        <select id={`${id}-dir`} value={f.direction} onChange={(e) => set({ direction: e.target.value as DirectionFilter })}>
          <option value="all">All</option>
          <option value="long">Long</option>
          <option value="short">Short</option>
        </select>
        <label htmlFor={`${id}-out`}>Outcome</label>
        <select id={`${id}-out`} value={f.outcome} onChange={(e) => set({ outcome: e.target.value as OutcomeFilter })}>
          <option value="all">All</option>
          <option value="win">Win</option>
          <option value="loss">Loss</option>
          <option value="flat">Flat</option>
        </select>
        <label htmlFor={`${id}-sort`}>Sort</label>
        <select id={`${id}-sort`} value={f.sort} onChange={(e) => set({ sort: e.target.value as SortKey })}>
          <option value="date_asc">Date, oldest first</option>
          <option value="date_desc">Date, newest first</option>
          <option value="r_desc">R, best first</option>
          <option value="r_asc">R, worst first</option>
        </select>
        <label htmlFor={`${id}-from`}>From</label>
        <input id={`${id}-from`} type="date" value={f.from} max={f.to || undefined} onChange={(e) => set({ from: e.target.value })} />
        <label htmlFor={`${id}-to`}>To</label>
        <input id={`${id}-to`} type="date" value={f.to} min={f.from || undefined} onChange={(e) => set({ to: e.target.value })} />
      </div>
      <button type="button" disabled={!filtersChanged(f)} onClick={reset}>Reset filters</button>
    </div>
  );
}