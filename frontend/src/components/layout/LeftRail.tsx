import { useState, type ReactNode } from "react";
import { AnnotationLegend } from "@/components/AnnotationLegend";
import { DevSetupLoader } from "@/annotations/DevSetupLoader";
import { ParamForm } from "@/components/scan/ParamForm";
import { ParamSummary } from "@/components/scan/ParamSummary";
import { ScanRangePicker } from "@/components/scan/ScanRangePicker";
import { StrategyPicker } from "@/components/scan/StrategyPicker";
import { Icon } from "@/components/ui/Icon";
import { TipLine } from "@/components/ui/TipLine";
import { usePanelStore } from "@/panels/panelStore";
import { groupOpen } from "@/scan/paramSummary";
import { selectStrategyDef, useScanStore } from "@/scan/scanStore";
import "@/styles/overflow.css";

interface Props {
  collapsed: boolean;
  onToggle: () => void;
}

function Group({ title, count, open, onToggle, children }: {
  title: string;
  count?: number;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="rail-group" data-open={open}>
      <h3 className="rail-group-head">
        <button type="button" aria-expanded={open} onClick={onToggle}>
          <span aria-hidden="true" className="rail-caret"><Icon name={open ? "caret-down" : "caret-right"} size={12} /></span>
          {title}
          {count ? <span className="rail-count">({count})</span> : null}
        </button>
      </h3>
      {open && <div className="rail-group-body">{children}</div>}
    </section>
  );
}

export function LeftRail({ collapsed, onToggle }: Props) {
  const hasScanned = useScanStore((s) => Object.values(s.panels).some((p) => p.result !== undefined));
  const nParams = useScanStore((s) => selectStrategyDef(s)?.params.length ?? 0);
  const layout = usePanelStore((s) => s.layout);
  const [rangeChoice, setRangeChoice] = useState<boolean | null>(null);
  const [paramsChoice, setParamsChoice] = useState<boolean | null>(null);
  const rangeOpen = groupOpen(rangeChoice, hasScanned);
  const paramsOpen = groupOpen(paramsChoice, hasScanned);

  return (
    <aside className="region rail rail-left" data-collapsed={collapsed} aria-label="Strategy and layers">
      <div className="rail-head">
        {!collapsed && <span>Strategy</span>}
        <button
          type="button"
          className="icon-btn"
          onClick={onToggle}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand left rail" : "Collapse left rail"}
        >
          <Icon name={collapsed ? "chevrons-right" : "chevrons-left"} />
        </button>
      </div>
      {!collapsed && (
        <div className="rail-body">
          <StrategyPicker />
          {!paramsOpen && <ParamSummary onEdit={() => setParamsChoice(true)} />}
          <Group title="Scan range" open={rangeOpen} onToggle={() => setRangeChoice(!rangeOpen)}>
            <ScanRangePicker />
          </Group>
          <Group title="Parameters" count={nParams} open={paramsOpen} onToggle={() => setParamsChoice(!paramsOpen)}>
            <ParamForm />
          </Group>
          <div className="rail-section-title">Layers</div>
          <AnnotationLegend />
          <TipLine key={layout} id={`layout-${layout}`}>
            {layout === "stack" ? "Click a bar to drill down. Press ? for all shortcuts." : "Press J / K to walk setups. Press ? for all shortcuts."}
          </TipLine>
          {import.meta.env.DEV && <DevSetupLoader />}
        </div>
      )}
    </aside>
  );
}