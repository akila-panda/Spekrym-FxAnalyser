import { resolveTz } from "@/lib/format";
import { formatInTz } from "@/lib/tz";
import { selectActiveSetup, useScanStore } from "@/scan/scanStore";
import { useViewStore } from "@/store/viewStore";
import { ConditionChecklist } from "./ConditionChecklist";
import { OutcomeBadge } from "./OutcomeBadge";
import { StepScrubber } from "./StepScrubber";
import { WhatIfEditor } from "./WhatIfEditor";

export function SetupDetail() {
  const setup = useScanStore(selectActiveSetup);
  const active = useScanStore((s) => s.active);
  const panel = useScanStore((s) => (s.active ? s.panels[s.active.tf] : undefined));
  const timezone = useViewStore((s) => s.timezone);

  if (!setup || !active || !panel?.result) {
    return <p className="hint detail-empty">Select a setup to see why it qualified or was rejected.</p>;
  }
  const strategy = panel.result.strategy;
  const tz = resolveTz(timezone, strategy.display_tz);
  const o = setup.outcome;

  return (
    <section className="setup-detail" aria-label="Setup detail">
      <h3>
        {strategy.name} <span className="chip mono">{active.tf}</span>
      </h3>
      <p className="mono hint">
        {setup.date}
        {setup.direction ? ` · ${setup.direction}` : ""} · {formatInTz(setup.focus.from, tz)} to {formatInTz(setup.focus.to, tz)}
      </p>
      {panel.stale && <p className="hint">From a stale scan. Inputs changed since it ran.</p>}
      <div className="detail-outcome">
        <OutcomeBadge status={setup.status} outcome={o} />
        {o && (
          <span className="hint mono">
            {o.net_pips.toFixed(1)} pips net of {o.cost_pips.toFixed(1)} cost · {o.exit_reason} · {o.bars_held} bars
          </span>
        )}
      </div>
      <div className="rail-section-title">Conditions</div>
      <ConditionChecklist conditions={setup.conditions} />
      <WhatIfEditor setup={setup} />
      <div className="rail-section-title">Steps</div>
      <StepScrubber displayTz={strategy.display_tz} />
    </section>
  );
}