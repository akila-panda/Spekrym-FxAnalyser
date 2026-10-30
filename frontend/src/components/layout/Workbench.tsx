import { useEffect, useRef } from "react";
import { EmptyStage } from "@/components/panel/EmptyStage";
import { CommandPalette } from "@/components/ui/CommandPalette";
import { ShortcutsSheet } from "@/components/ui/ShortcutsSheet";
import { useSetupNavigation } from "@/hooks/useSetupNavigation";
import { useUrlState } from "@/url/useUrlState";
import { PanelGrid } from "@/panels/PanelGrid";
import { usePanelStore } from "@/panels/panelStore";
import { DockedPlaceholder } from "@/window/DockedPlaceholder";
import { useDockStore } from "@/window/dockStore";
import { useMainPopouts } from "@/window/useMainPopouts";
import { HeaderBar } from "./HeaderBar";
import { useModeStore } from "./modeStore";
import { AUTO_COLLAPSE_MS, shouldAutoCollapse } from "./modes";
import { LeftRail } from "./LeftRail";
import { RightRail } from "./RightRail";
import { SummaryStrip } from "./SummaryStrip";

export function Workbench() {
  useUrlState();
  useSetupNavigation();
  useMainPopouts();
  const leftCollapsed = useModeStore((s) => s.leftCollapsed);
  const rightCollapsed = useModeStore((s) => s.rightCollapsed);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearTimer = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => clearTimer, []);
  // opt-in: rails collapse after 1.5s of pointer time over the stage (Investigate only); the rail toggles bring them back
  const onStageEnter = () => {
    const { mode, autoCollapse } = useModeStore.getState();
    clearTimer();
    if (shouldAutoCollapse(mode, autoCollapse)) timer.current = setTimeout(() => useModeStore.getState().collapseRails(), AUTO_COLLAPSE_MS);
  };
  const layout = usePanelStore((s) => s.layout);
  const chartsOut = useDockStore((s) => s.popped.has("charts"));
  const stackOut = useDockStore((s) => s.popped.has("stack") && layout === "stack");

  return (
    <div
      className="workbench"
      data-left={leftCollapsed ? "collapsed" : "open"}
      data-right={rightCollapsed ? "collapsed" : "open"}
    >
      <HeaderBar />
      <LeftRail collapsed={leftCollapsed} onToggle={() => useModeStore.getState().toggleLeft()} />
      <main className="stage" aria-label="Charts" onPointerEnter={onStageEnter} onPointerLeave={clearTimer}>
        {chartsOut ? (
          <DockedPlaceholder what="Charts" roleKey="charts" />
        ) : stackOut ? (
          <DockedPlaceholder what="The stack" roleKey="stack" />
        ) : (
          <>
            <PanelGrid />
            <EmptyStage />
          </>
        )}
      </main>
      <RightRail collapsed={rightCollapsed} onToggle={() => useModeStore.getState().toggleRight()} />
      <SummaryStrip />
      <ShortcutsSheet />
      <CommandPalette />
    </div>
  );
}