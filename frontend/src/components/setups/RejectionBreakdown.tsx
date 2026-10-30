import { useMemo } from "react";
import { useScanStore } from "@/scan/scanStore";
import { rejectionCounts } from "@/scan/rejections";
import { PANEL_ORDER } from "@/types/market";
import "@/styles/rejections.css";

/** Which condition kills the most candidates. Click a bar to list exactly those rejections. Exploratory. */
export function RejectionBreakdown() {
  const panels = useScanStore((s) => s.panels);
  const tab = useScanStore((s) => s.tab);
  const failed = useScanStore((s) => s.filters.failedCondition);
  const setFilters = useScanStore((s) => s.setFilters);

  const counts = useMemo(() => {
    const tfs = tab === "all" ? PANEL_ORDER : [tab];
    return rejectionCounts(tfs.flatMap((tf) => panels[tf].result?.setups ?? []));
  }, [panels, tab]);

  if (counts.length === 0) return null;
  const max = Math.max(...counts.map((c) => c.count));

  return (
    <section className="rejections" aria-label="Rejection breakdown">
      <h4 className="rej-title">
        First failed condition <span className="rej-tag">exploratory</span>
      </h4>
      <ul className="rej-list">
        {counts.map((c) => {
          const on = failed === c.key;
          return (
            <li key={c.key}>
              <button
                type="button"
                aria-pressed={on}
                title={on ? "Show all setups again" : `List rejections where "${c.label}" failed first`}
                onClick={() => setFilters(on ? { failedCondition: "" } : { failedCondition: c.key, showRejected: true })}
              >
                <span className="rej-label">{c.label}</span>
                <span className="rej-track" aria-hidden="true">
                  <span className="rej-bar" style={{ width: `${(c.count / max) * 100}%` }} />
                </span>
                <span className="rej-count mono">{c.count}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {failed && (
        <button type="button" className="rej-clear" onClick={() => setFilters({ failedCondition: "" })}>
          Clear rejection filter
        </button>
      )}
    </section>
  );
}