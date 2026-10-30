import { useMemo, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { analyze } from "@/analytics/scanAnalytics";
import { usePanelStore } from "@/panels/panelStore";
import { useScanStore } from "@/scan/scanStore";
import type { ScanResult } from "@/types";
import "@/styles/analytics.css";

const r1 = (x: number | null): string => (x === null ? "—" : x.toFixed(2));
const pct = (x: number | null): string => (x === null ? "—" : `${Math.round(x * 100)}%`);

/** Compact analytics for the active (or focused) scan: expectancy, distribution, equity curve. `bare` drops the own toggle (DX3: the rail section is the toggle). */
export function ScanAnalytics({ bare = false }: { bare?: boolean } = {}) {
  const active = useScanStore((s) => s.active);
  const focused = usePanelStore((s) => s.focused);
  const result: ScanResult | undefined = useScanStore(
    (s) => (active ? s.panels[active.tf].result : s.panels[focused].result),
  );
  const [open, setOpen] = useState(true);
  const a = useMemo(() => (result ? analyze(result) : null), [result]);

  if (!a || a.n === 0) return bare ? <p className="hint">No scored setups yet.</p> : null;

  const maxBar = Math.max(1, ...a.histogram.map((b) => b.count));
  const lo = Math.min(0, ...a.equity);
  const hi = Math.max(0, ...a.equity);
  const span = hi - lo || 1;
  const pts = a.equity
    .map((v, i) => `${(i / Math.max(1, a.equity.length - 1)) * 100},${30 - ((v - lo) / span) * 30}`)
    .join(" ");

  return (
    <section className="analytics" aria-label="Scan analytics">
      {!bare && (
        <button type="button" className="analytics-head" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          <Icon name={open ? "caret-down" : "caret-right"} size={12} /> Analytics
        </button>
      )}
      {(bare || open) && (
        <div className="analytics-body">
          <dl className="analytics-stats">
            <div><dt>Setups</dt><dd>{a.n}</dd></div>
            <div><dt>Win rate</dt><dd>{pct(a.winRate)}</dd></div>
            <div><dt>Expectancy</dt><dd>{r1(a.expectancyR)}R</dd></div>
            <div><dt>Profit factor</dt><dd>{r1(a.profitFactor)}</dd></div>
            <div><dt>Max DD</dt><dd>{r1(a.maxDrawdownR)}R</dd></div>
            <div><dt>Long / Short</dt><dd>{pct(a.long.winRate)} / {pct(a.short.winRate)}</dd></div>
          </dl>

          <svg className="equity-spark" viewBox="0 0 100 30" preserveAspectRatio="none" role="img" aria-label="Equity curve in R">
            <line x1="0" x2="100" y1={30 - ((0 - lo) / span) * 30} y2={30 - ((0 - lo) / span) * 30} className="equity-zero" />
            <polyline points={pts} fill="none" />
          </svg>

          <ul className="r-hist">
            {a.histogram.map((b) => (
              <li key={b.label}>
                <span className="r-hist-label">{b.label}</span>
                <span className="r-hist-bar" style={{ width: `${(b.count / maxBar) * 100}%` }} aria-hidden="true" />
                <span className="r-hist-count">{b.count}</span>
              </li>
            ))}
          </ul>

          {a.n < 30 && <p className="analytics-note">Too few setups (under 30) to read into.</p>}
        </div>
      )}
    </section>
  );
}