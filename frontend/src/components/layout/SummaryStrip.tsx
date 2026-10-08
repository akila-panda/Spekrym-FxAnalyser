import { useMemo } from "react";
import { ChipShape } from "@/components/panel/PanelHeader";
import { allSummaries, formatPct, formatR, tfSummary, type TfSummary, MIN_SETUPS } from "@/scan/selectors";
import { panelChip, useScanStore } from "@/scan/scanStore";
import { PANEL_ORDER, type Timeframe } from "@/types/market";

const KNOWN_WARNING = /in-sample|too few/i;

/** Headline = the active timeframe's own scan. There is no total across timeframes: they overlap. */
export function SummaryStrip() {
  const panels = useScanStore((s) => s.panels);
  const tab = useScanStore((s) => s.tab);
  const active = useScanStore((s) => s.active);
  const setTab = useScanStore((s) => s.setTab);

  const all = useMemo(() => allSummaries(panels), [panels]);
  const activeTf: Timeframe | undefined =
    tab !== "all" && panels[tab].result ? tab : active?.tf ?? all[0]?.tf;
  const sum: TfSummary | null = activeTf ? tfSummary(panels, activeTf) : null;
  const extra = sum?.warnings.filter((w) => !KNOWN_WARNING.test(w)) ?? [];

  return (
    <footer className="region summary-strip" aria-label="Scan summary">
      <span className="headline" aria-label="Expectancy in R, net of cost">
        {sum && sum.expectancy_r !== null ? formatR(sum.expectancy_r) : "—"}
      </span>
      <span className="side mono">
        {sum ? (
          <>
            {sum.tf} · expectancy R, net of {sum.cost_pips.toFixed(1)} pip cost
            {" · "}win {sum.win_rate !== null ? formatPct(sum.win_rate) : "—"} · n={sum.n_valid}
            {sum.stale && " · stale"}
          </>
        ) : (
          "expectancy R, net of cost"
        )}
      </span>
      <span className="badge">Exploratory scan, not validated</span>
      {sum?.tooFew && (
        <span className="side" role="status">
          Only {sum.n_valid} setups (under {MIN_SETUPS}): too few setups to read anything into.
        </span>
      )}
      {extra.map((w) => (
        <span key={w} className="side">{w}</span>
      ))}
      <span className="tf-chips" role="group" aria-label="Scan by timeframe">
        {PANEL_ORDER.map((tf) => {
          const chip = panelChip(panels[tf]);
          const s = tfSummary(panels, tf);
          return (
            <button
              key={tf} type="button" className="tf-chip mono" aria-pressed={tab === tf}
              aria-label={`Show ${tf} setups`} title={`${tf}: ${s ? `${s.n_valid} setups` : chip.text}`} onClick={() => setTab(tf)}
            >
              {tf} <ChipShape state={chip.state} />
              {s ? ` ${s.n_valid}${s.expectancy_r !== null ? ` · ${formatR(s.expectancy_r)}` : ""}` : chip.state === "unsupported" ? " ✕" : ""}
            </button>
          );
        })}
      </span>
    </footer>
  );
}