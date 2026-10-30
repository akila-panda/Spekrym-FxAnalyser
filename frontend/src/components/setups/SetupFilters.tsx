import { useId, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { DEFAULT_FILTERS, filtersChanged, type DirectionFilter, type OutcomeFilter, type SetupFilters as FilterState, type SortKey } from "@/scan/selectors";
import { useScanStore } from "@/scan/scanStore";

/** DX3: number of filter fields that differ from the defaults. Pure. */
export function activeFilterCount(f: FilterState): number {
  return (Object.keys(DEFAULT_FILTERS) as (keyof FilterState)[]).filter((k) => f[k] !== DEFAULT_FILTERS[k]).length;
}

/** DX3: one-line description of the filters that are set; empty when none. Pure. */
export function filterSummary(f: FilterState): string {
  const out: string[] = [];
  if (f.showRejected !== DEFAULT_FILTERS.showRejected) out.push(f.showRejected ? "rejected shown" : "rejected hidden");
  if (f.failedCondition) out.push(`failed ${f.failedCondition}`);
  if (f.review !== DEFAULT_FILTERS.review) out.push(`review ${f.review}`);
  if (f.direction !== DEFAULT_FILTERS.direction) out.push(f.direction);
  if (f.outcome !== DEFAULT_FILTERS.outcome) out.push(f.outcome);
  if (f.sort !== DEFAULT_FILTERS.sort) out.push(`sort ${f.sort.replace("_", " ")}`);
  if (f.from !== DEFAULT_FILTERS.from) out.push(`from ${f.from}`);
  if (f.to !== DEFAULT_FILTERS.to) out.push(`to ${f.to}`);
  return out.join(" · ");
}

export function SetupFilters() {
  const id = useId();
  const f = useScanStore((s) => s.filters);
  const set = useScanStore((s) => s.setFilters);
  const reset = useScanStore((s) => s.resetFilters);
  const [open, setOpen] = useState(false);
  const n = activeFilterCount(f);
  const summary = filterSummary(f);
  return (
    <div className="setup-filters" role="group" aria-label="Setup filters">
      <button
        type="button"
        className="filters-toggle"
        aria-expanded={open}
        aria-controls={`${id}-body`}
        onClick={() => setOpen((v) => !v)}
      >
        <span aria-hidden="true" className="rail-caret"><Icon name={open ? "caret-down" : "caret-right"} size={12} /></span> Filters ({n})
      </button>
      {!open && summary && <p className="hint mono filters-summary">{summary}</p>}
      {open && (
        <div id={`${id}-body`}>
          <label className="check">
            <input type="checkbox" checked={f.showRejected} onChange={(e) => set({ showRejected: e.target.checked })} /> Show rejected candidates
          </label>
          {f.failedCondition && (
            <p className="hint">
              Rejected for: <span className="mono">{f.failedCondition}</span>{" "}
              <button type="button" onClick={() => set({ failedCondition: "" })}>Clear</button>
            </p>
          )}
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
      )}
    </div>
  );
}