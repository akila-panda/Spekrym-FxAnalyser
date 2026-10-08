import { useEffect, useMemo, useRef } from "react";
import { useScanStore } from "@/scan/scanStore";
import { rowKey, rowsFor, tabCounts, TABS, type Tab } from "@/scan/selectors";
import { OutcomeBadge } from "./OutcomeBadge";
import { SetupFilters } from "./SetupFilters";

const DIR = { long: "▲ long", short: "▼ short" } as const;

export function SetupList() {
  const panels = useScanStore((s) => s.panels);
  const tab = useScanStore((s) => s.tab);
  const filters = useScanStore((s) => s.filters);
  const active = useScanStore((s) => s.active);
  const setTab = useScanStore((s) => s.setTab);
  const activate = useScanStore((s) => s.activate);

  const rows = useMemo(() => rowsFor(panels, tab, filters), [panels, tab, filters]);
  const counts = useMemo(() => tabCounts(panels, filters), [panels, filters]);
  const anyScan = TABS.some((t) => t !== "all" && panels[t].result);
  const activeKey = active ? rowKey(active.tf, active.id) : null;

  const activeRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [activeKey]);

  const label = (t: Tab) => (t === "all" ? "All" : t);
  let empty: string | null = null;
  if (rows.length === 0) {
    if (!anyScan) empty = "No scan yet.";
    else if (tab !== "all" && !panels[tab].result) empty = `No ${tab} scan yet. Use Scan in the ${tab} chart header.`;
    else empty = "No setups match these filters. Turn on rejected candidates or widen the dates.";
  }

  return (
    <div className="setup-list">
      <div role="tablist" aria-label="Setups by timeframe" className="setup-tabs">
        {TABS.map((t) => (
          <button
            key={t} type="button" role="tab" id={`setup-tab-${t}`} aria-selected={tab === t}
            aria-controls="setup-rows" onClick={() => setTab(t)}
          >
            {label(t)} <span className="mono">{counts[t]}</span>
          </button>
        ))}
      </div>
      <SetupFilters />
      <div id="setup-rows" role="tabpanel" aria-labelledby={`setup-tab-${tab}`}>
        {empty ? (
          <p>{empty}</p>
        ) : (
          <ul className="setup-rows" aria-label="Setups">
            {rows.map((r) => {
              const isActive = r.key === activeKey;
              return (
                <li key={r.key}>
                  <button
                    type="button" className="setup-row" aria-current={isActive || undefined}
                    ref={isActive ? activeRef : undefined}
                    onClick={() => activate(r.tf, r.setup.id)}
                  >
                    <span className="mono">{r.setup.date}</span>
                    <span>{r.setup.direction ? DIR[r.setup.direction] : "—"}</span>
                    {tab === "all" && <span className="chip mono">{r.tf}</span>}
                    <OutcomeBadge status={r.setup.status} outcome={r.setup.outcome} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}