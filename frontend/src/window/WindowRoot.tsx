import { useEffect, useState, type ReactNode } from "react";
import { Workbench } from "@/components/layout/Workbench";
import { ExportButton } from "@/components/setups/ExportButton";
import { SetupsPane } from "@/components/setups/SetupsPane";
import { useSetupNavigation } from "@/hooks/useSetupNavigation";
import { PanelGrid } from "@/panels/PanelGrid";
import { usePanelStore } from "@/panels/panelStore";
import type { Timeframe } from "@/types/market";
import { useUrlState } from "@/url/useUrlState";
import { DeskRoot } from "@/desk/workspace/DeskRoot";
import { CanvasRoot } from "@/desk/canvas/CanvasRoot";
import { JournalRoot } from "@/desk/journal/JournalRoot";
import { AnalyticsRoot } from "@/desk/analytics/AnalyticsRoot";
import { WorkbenchRoot } from "@/desk/workbench/WorkbenchRoot";
import { BrainRoot } from "@/desk/brain/BrainRoot";
import { PortfolioRoot } from "@/desk/portfolio/PortfolioRoot";
import { OpsRoot } from "@/desk/ops/OpsRoot";
import { DemoRoot } from "@/desk/demo/DemoRoot"; // DEMO (removable)
import { useDeskStore } from "@/desk/workspace/deskStore";
import { MiniBar } from "./MiniBar";
import { parseRole, roleEquals, type WindowRole } from "./role";

/** Role is read once at boot and again on navigation (popstate). */
export function useWindowRole(): WindowRole {
  const [role, setRole] = useState<WindowRole>(() => parseRole(window.location.search));
  useEffect(() => {
    const onNav = () => {
      const next = parseRole(window.location.search);
      setRole((prev) => (roleEquals(prev, next) ? prev : next));
    };
    window.addEventListener("popstate", onNav);
    return () => window.removeEventListener("popstate", onNav);
  }, []);
  return role;
}

function RoleShell({ role, children }: { role: WindowRole; children: ReactNode }) {
  useUrlState();
  useSetupNavigation();
  return (
    <div className="window-root" data-role={role.kind === "chart" ? `chart:${role.tf}` : role.kind}>
      <MiniBar role={role} />
      {children}
    </div>
  );
}

function ChartsOnly() {
  return (
    <main className="window-stage" aria-label="Charts">
      <PanelGrid />
    </main>
  );
}

/** One maximised chart. The role pins layout and timeframe. */
function ChartOnly({ tf }: { tf: Timeframe }) {
  const layout = usePanelStore((s) => s.layout);
  const focused = usePanelStore((s) => s.focused);
  useEffect(() => {
    const st = usePanelStore.getState();
    if (st.focused !== tf) st.focus(tf);
    if (st.layout !== "maximized") st.setLayout("maximized");
  }, [tf, layout, focused]);
  return (
    <main className="window-stage" aria-label={`${tf} chart`}>
      <PanelGrid />
    </main>
  );
}

/** The MTF column. The role pins the layout to stack. */
function StackOnly() {
  const layout = usePanelStore((s) => s.layout);
  useEffect(() => {
    if (usePanelStore.getState().layout !== "stack") usePanelStore.getState().setLayout("stack");
  }, [layout]);
  return (
    <main className="window-stage" aria-label="Stack">
      <PanelGrid />
    </main>
  );
}

function SetupsOnly() {
  return (
    <aside className="region rail window-setups" aria-label="Setups and detail">
      <div className="rail-head">
        <span>Setups</span>
        <ExportButton />
      </div>
      <div className="rail-body rail-body--split">
        <SetupsPane />
      </div>
    </aside>
  );
}

export function WindowRoot() {
  const role = useWindowRole();
  const app = useDeskStore((s) => s.app);
  // Desk is an app-level switch, main role only. Popouts (charts/setups/stack) always show Scan.
  if (role.kind === "main") return app === "desk" ? <DeskRoot /> : <Workbench />;
  return (
    <RoleShell role={role}>
      {role.kind === "charts" && <ChartsOnly />}
      {role.kind === "chart" && <ChartOnly tf={role.tf} />}
      {role.kind === "setups" && <SetupsOnly />}
      {role.kind === "stack" && <StackOnly />}
      {role.kind === "canvas" && <CanvasRoot />}
      {role.kind === "analytics" && <AnalyticsRoot />}
      {role.kind === "journal" && <JournalRoot />}
      {role.kind === "workbench" && <WorkbenchRoot />}
      {role.kind === "brain" && <BrainRoot />}
      {role.kind === "portfolio" && <PortfolioRoot />}
      {role.kind === "ops" && <OpsRoot />}
      {role.kind === "demo" && <DemoRoot />}
    </RoleShell>
  );
}