import { AnnotationLegend } from "@/components/AnnotationLegend";
import { DevSetupLoader } from "@/annotations/DevSetupLoader";
import { ParamForm } from "@/components/scan/ParamForm";
import { ScanRangePicker } from "@/components/scan/ScanRangePicker";
import { StrategyPicker } from "@/components/scan/StrategyPicker";

interface Props {
  collapsed: boolean;
  onToggle: () => void;
}

export function LeftRail({ collapsed, onToggle }: Props) {
  return (
    <aside className="region rail rail-left" data-collapsed={collapsed} aria-label="Strategy and layers">
      <div className="rail-head">
        {!collapsed && <span>Strategy</span>}
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand left rail" : "Collapse left rail"}
        >
          {collapsed ? "»" : "«"}
        </button>
      </div>
      {!collapsed && (
        <div className="rail-body">
          <StrategyPicker />
          <ScanRangePicker />
          <div className="rail-section-title">Parameters</div>
          <ParamForm />
          <div className="rail-section-title">Layers</div>
          <AnnotationLegend />
          {import.meta.env.DEV && <DevSetupLoader />}
        </div>
      )}
    </aside>
  );
}