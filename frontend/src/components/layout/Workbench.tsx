import { useState } from "react";
import { useSetupNavigation } from "@/hooks/useSetupNavigation";
import { useUrlState } from "@/url/useUrlState";
import { PanelGrid } from "@/panels/PanelGrid";
import { HeaderBar } from "./HeaderBar";
import { LeftRail } from "./LeftRail";
import { RightRail } from "./RightRail";
import { SummaryStrip } from "./SummaryStrip";

export function Workbench() {
  useUrlState();
  useSetupNavigation();
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);

  return (
    <div
      className="workbench"
      data-left={leftCollapsed ? "collapsed" : "open"}
      data-right={rightCollapsed ? "collapsed" : "open"}
    >
      <HeaderBar />
      <LeftRail collapsed={leftCollapsed} onToggle={() => setLeftCollapsed((v) => !v)} />
      <main className="stage" aria-label="Charts">
        <PanelGrid />
      </main>
      <RightRail collapsed={rightCollapsed} onToggle={() => setRightCollapsed((v) => !v)} />
      <SummaryStrip />
    </div>
  );
}