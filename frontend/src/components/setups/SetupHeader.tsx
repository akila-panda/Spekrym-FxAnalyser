/** DX3: the selected setup at a glance. Direction and result carry shape + text, never colour alone. */
import { ChipShape } from "@/components/panel/PanelHeader";
import { formatInTz } from "@/lib/tz";
import { formatR } from "@/scan/selectors";
import type { Setup } from "@/types";

interface Props {
  setup: Setup;
  tf: string;
  strategyName: string;
  tz: string;
}

const DIR = { long: "▲ LONG", short: "▼ SHORT" } as const;

export function SetupHeader({ setup, tf, strategyName, tz }: Props) {
  const o = setup.outcome;
  const rejected = setup.status === "rejected" || !o;
  const time = formatInTz(setup.focus.from, tz).slice(-5);
  return (
    <header className="setup-header" aria-label="Setup summary">
      <div className="setup-header-main">
        <span className="setup-dir mono">{setup.direction ? DIR[setup.direction] : "—"}</span>
        {rejected ? (
          <span className="chip mono setup-chip"><ChipShape state="idle" /> rejected</span>
        ) : (
          <span className="setup-r mono" data-result={o.result} title="R multiple, net of cost">{formatR(o.r_multiple)}</span>
        )}
      </div>
      <p className="hint mono">{setup.date} · {time} {tz} · {tf} · {strategyName}</p>
      {o && (
        <p className="hint mono">
          {o.net_pips.toFixed(1)} pips net of {o.cost_pips.toFixed(1)} cost · {o.exit_reason} · {o.bars_held} bars
        </p>
      )}
    </header>
  );
}