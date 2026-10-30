import { ExportButton } from "@/components/setups/ExportButton";
import { SetupsPane } from "@/components/setups/SetupsPane";
import { Icon } from "@/components/ui/Icon";
import { DockedPlaceholder } from "@/window/DockedPlaceholder";
import { useDockStore } from "@/window/dockStore";
import { PopoutButton } from "@/window/PopoutButton";

interface Props {
  collapsed: boolean;
  onToggle: () => void;
}

export function RightRail({ collapsed, onToggle }: Props) {
  const poppedOut = useDockStore((s) => s.popped.has("setups"));
  return (
    <aside className="region rail rail-right" data-collapsed={collapsed} aria-label="Setups and detail">
      <div className="rail-head">
        <button
          type="button"
          className="icon-btn"
          onClick={onToggle}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand right rail" : "Collapse right rail"}
        >
          <Icon name={collapsed ? "chevrons-left" : "chevrons-right"} />
        </button>
        {!collapsed && <span>Setups</span>}
        {!collapsed && <span className="spacer" />}
        {!collapsed && <PopoutButton role={{ kind: "setups" }} label="setups" />}
        {!collapsed && <ExportButton />}
      </div>
      {!collapsed && (
        <div className="rail-body rail-body--split">
          {poppedOut ? (
            <DockedPlaceholder what="Setups" roleKey="setups" />
          ) : (
            <SetupsPane />
          )}
        </div>
      )}
    </aside>
  );
}