import { ExportButton } from "@/components/setups/ExportButton";
import { ScanAnalytics } from "@/components/setups/ScanAnalytics";
import { SetupDetail } from "@/components/setups/SetupDetail";
import { SetupList } from "@/components/setups/SetupList";

interface Props {
  collapsed: boolean;
  onToggle: () => void;
}

export function RightRail({ collapsed, onToggle }: Props) {
  return (
    <aside className="region rail rail-right" data-collapsed={collapsed} aria-label="Setups and detail">
      <div className="rail-head">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand right rail" : "Collapse right rail"}
        >
          {collapsed ? "«" : "»"}
        </button>
        {!collapsed && <span>Setups</span>}
        {!collapsed && <span className="spacer" />}
        {!collapsed && <ExportButton />}
      </div>
      {!collapsed && (
        <div className="rail-body">
          <SetupList />
          <ScanAnalytics />
          <SetupDetail />
        </div>
      )}
    </aside>
  );
}