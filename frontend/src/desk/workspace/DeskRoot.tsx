/** DESK DK1 — the Desk shell: header (Scan|Desk, area, workflow, complexity, Focus, Simplify),
 *  a pinned-warning strip (always visible), and the body (MY DESK | Analysis) with a dock layout.
 *  DK1-a consolidates DeskHeader/MyDesk/AnalysisWorkspace/DockLayout/WidgetFrame here (thin placeholders);
 *  widget bodies are "sample" stubs until their phases. No new colours; shape+text carry meaning. */
import { useState, type ReactNode } from "react";
import { useUrlState } from "@/url/useUrlState";
import type { Complexity } from "@/desk/types/schemas";
import { AppSwitch } from "./AppSwitch";
import { useDeskKeys } from "./useDeskKeys";
import { COMPLEXITY_LABEL, COMPLEXITY_ORDER } from "./complexity";
import { useDeskStore, WORKFLOWS } from "./deskStore";
import { useDeskUiStore } from "./deskUiStore";
import { EvidenceDrawer } from "@/desk/evidence/EvidenceDrawer";
import { highImpactSoon } from "@/desk/context/calendar";
import { useDeskContext } from "@/desk/context/useContext";
import { useViewStore } from "@/store/viewStore";
import { isDemo } from "@/desk/demo/flag"; // DEMO (removable)
import { DeskStageChart } from "@/desk/demo/DeskStageChart"; // DEMO (removable)
import { fmtDuration } from "@/desk/context/sessions";
import { PrepareStage } from "@/desk/prepare/PrepareWidgets";
import { usePrepareSession } from "@/desk/prepare/usePrepare";
import { AsOfBadge } from "@/desk/replay/ReplayWidgets";
import { WIDGET_BODIES } from "./widgetBodies";
import { defaultWidgets, type Dock, type WidgetDef } from "./widgetRegistry";
import "@/styles/desk.css";

const WORKFLOW_LABEL: Record<string, string> = { prepare: "Prepare", live: "Live", review: "Review" };

function WidgetFrame({ def, onHide }: { def: WidgetDef; onHide: () => void }) {
  const [collapsed, setCollapsed] = useState(false);
  const [pinned, setPinned] = useState(false);
  const Body = WIDGET_BODIES[def.id];
  return (
    <section className="dk-widget" aria-label={def.title} data-pinned={pinned}>
      <header className="dk-widget-head">
        <strong>{def.title}</strong>
        <span className="dk-widget-actions">
          <button type="button" className="dk-icon" aria-pressed={pinned} aria-label={`Pin ${def.title}`} title="Pin" onClick={() => setPinned((v) => !v)}>⌖</button>
          <button type="button" className="dk-icon" aria-expanded={!collapsed} aria-label={`${collapsed ? "Expand" : "Collapse"} ${def.title}`} title="Collapse" onClick={() => setCollapsed((v) => !v)}>{collapsed ? "▸" : "▾"}</button>
          <button type="button" className="dk-icon" aria-label={`Hide ${def.title}`} title="Hide" onClick={onHide}>✕</button>
        </span>
      </header>
      {!collapsed && (
        <div className="dk-widget-body">
          {Body ? <Body /> : <><span className="dk-sample">sample</span> {def.id}</>}
        </div>
      )}
    </section>
  );
}

function DockLayout({ widgets, focusOn, children }: { widgets: WidgetDef[]; focusOn: boolean; children: ReactNode }) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const shown = widgets.filter((w) => !hidden.has(w.id));
  const inDock = (d: Dock) => shown.filter((w) => w.dock === d);
  const hide = (id: string) => setHidden((h) => new Set(h).add(id));
  if (focusOn) return <div className="dk-docklayout dk-focus">{children}</div>;
  return (
    <div className="dk-docklayout">
      {inDock("left").length > 0 && <aside className="dk-dock dk-dock-left">{inDock("left").map((w) => <WidgetFrame key={w.id} def={w} onHide={() => hide(w.id)} />)}</aside>}
      <div className="dk-dock dk-dock-center">
        {children}
        {inDock("bottom").length > 0 && <div className="dk-dock-bottom">{inDock("bottom").map((w) => <WidgetFrame key={w.id} def={w} onHide={() => hide(w.id)} />)}</div>}
      </div>
      {inDock("right").length > 0 && <aside className="dk-dock dk-dock-right">{inDock("right").map((w) => <WidgetFrame key={w.id} def={w} onHide={() => hide(w.id)} />)}</aside>}
    </div>
  );
}

function Stage({ label }: { label: string }) {
  const stagePair = useViewStore((v) => v.pair);
  // DEMO (removable): with ?demo=1 the stage shows a real chart driven by the Desk detectors. Delete the
  // two demo imports + this block (and src/desk/demo/) to remove.
  if (isDemo()) {
    return <main className="dk-stage" aria-label={label} style={{ position: "relative", display: "block", placeItems: "initial" }}><DeskStageChart pair={stagePair} /></main>;
  }
  return <main className="dk-stage" aria-label={label}><p className="dk-stage-note"><span className="dk-sample">sample</span> {label} — charts arrive in a later phase.</p></main>;
}

function PrepareDesk() {
  usePrepareSession();
  const complexity = useDeskStore((s) => s.complexity);
  const focusOn = useDeskUiStore((s) => s.focusOn);
  return <DockLayout widgets={defaultWidgets("prepare", complexity)} focusOn={focusOn}><PrepareStage /></DockLayout>;
}

function MyDesk() {
  const workflow = useDeskStore((s) => s.workflow);
  const complexity = useDeskStore((s) => s.complexity);
  const focusOn = useDeskUiStore((s) => s.focusOn);
  if (workflow === "prepare") return <PrepareDesk />;
  const widgets = defaultWidgets(workflow, complexity);
  return <DockLayout widgets={widgets} focusOn={focusOn}><Stage label={`MY DESK · ${WORKFLOW_LABEL[workflow]}`} /></DockLayout>;
}

function AnalysisWorkspace() {
  const complexity = useDeskStore((s) => s.complexity);
  const focusOn = useDeskUiStore((s) => s.focusOn);
  const widgets = defaultWidgets("analysis", complexity);
  return <DockLayout widgets={widgets} focusOn={focusOn}><Stage label="Analysis" /></DockLayout>;
}

function ComplexityControl() {
  const complexity = useDeskStore((s) => s.complexity);
  const setComplexity = useDeskStore((s) => s.setComplexity);
  return (
    <div className="dk-seg" role="group" aria-label="Complexity">
      {COMPLEXITY_ORDER.map((c: Complexity) => (
        <button key={c} type="button" aria-pressed={complexity === c} onClick={() => setComplexity(c)}>{COMPLEXITY_LABEL[c]}</button>
      ))}
    </div>
  );
}

function DeskHeader() {
  const area = useDeskStore((s) => s.area);
  const setArea = useDeskStore((s) => s.setArea);
  const workflow = useDeskStore((s) => s.workflow);
  const setWorkflow = useDeskStore((s) => s.setWorkflow);
  const focusOn = useDeskUiStore((s) => s.focusOn);
  const toggleFocus = useDeskUiStore((s) => s.toggleFocus);
  const simplify = useDeskUiStore((s) => s.simplify);
  const simplifyPrev = useDeskUiStore((s) => s.simplifyPrev);
  const hasSelection = useDeskUiStore((s) => s.selectedObjectId !== null);
  const evidenceOpen = useDeskUiStore((s) => s.evidenceOpen);
  const toggleEvidence = useDeskUiStore((s) => s.toggleEvidence);
  return (
    <header className="region header-bar dk-header" aria-label="Desk controls">
      <AppSwitch />
      <div className="dk-seg" role="group" aria-label="Desk area">
        <button type="button" aria-pressed={area === "my"} onClick={() => setArea("my")}>MY DESK</button>
        <button type="button" aria-pressed={area === "analysis"} onClick={() => setArea("analysis")}>Analysis</button>
      </div>
      {area === "my" && (
        <div className="dk-seg" role="group" aria-label="Workflow">
          {WORKFLOWS.map((w) => (
            <button key={w} type="button" aria-pressed={workflow === w} onClick={() => setWorkflow(w)}>{WORKFLOW_LABEL[w]}</button>
          ))}
        </div>
      )}
      <span className="spacer" />
      <ComplexityControl />
      <button type="button" aria-pressed={focusOn} onClick={toggleFocus} title="Focus (hide widgets)">Focus</button>
      <button type="button" aria-pressed={simplifyPrev !== null} onClick={simplify} title="Simplify to Minimal and back">Simplify</button>
      <button type="button" aria-pressed={evidenceOpen} disabled={!hasSelection} onClick={toggleEvidence} title="Evidence for the selected object (E)">Evidence</button>
    </header>
  );
}

function PinnedWarnings() {
  // Always-on "sample data"; DK15 adds high-impact-event-soon and stale-data. Invalidation arrives with its phase.
  const ctx = useDeskContext();
  const pair = useViewStore((v) => v.pair);
  const data = ctx.status === "ready" ? ctx.data : null;
  const soon = data && data.caps.data.calendar !== "absent" ? highImpactSoon(data.events.data, data.now, pair) : null;
  const stale = !!data && (data.caps.provenance.stale || data.events.provenance.stale);
  return (
    <div className="dk-pinned" role="status" aria-label="Pinned warnings">
      <span className="dk-pin dk-pin-sample">⚠ Sample data</span>
      {stale && <span className="dk-pin">⚠ Stale data</span>}
      {soon && <span className="dk-pin">⚠ High-impact event {soon.time >= (data as { now: number }).now ? `in ${fmtDuration(soon.time - (data as { now: number }).now)}` : "just released"}: {soon.currency} {soon.title}</span>}
    </div>
  );
}

export function DeskRoot() {
  useUrlState();
  useDeskKeys();
  const area = useDeskStore((s) => s.area);
  const focusOn = useDeskUiStore((s) => s.focusOn);
  const setFocus = useDeskUiStore((s) => s.setFocus);
  return (
    <div className="dk-root" data-area={area}>
      <DeskHeader />
      <PinnedWarnings />
      <AsOfBadge />
      {focusOn && <button type="button" className="dk-restore" onClick={() => setFocus(false)}>⤢ Restore (Esc)</button>}
      {area === "my" ? <MyDesk /> : <AnalysisWorkspace />}
      <EvidenceDrawer />
    </div>
  );
}