/** DESK DK0 — widget registry: id, title, default dock, min size, min complexity level, and the
 *  workflows where a widget is visible by default. Components are registered in later phases; this is
 *  the metadata the shell (DK1) uses to lay out docks and gate by complexity. */
import type { Complexity } from "@/desk/types/schemas";

export type Workflow = "prepare" | "live" | "review" | "analysis";
export type Dock = "left" | "center" | "right" | "bottom";

export interface WidgetDef {
  id: string;
  title: string;
  minLevel: Complexity;
  /** Workflows where this widget is visible by default (the "three widgets" per workflow). */
  defaultIn: Workflow[];
  dock: Dock;
  minSize: { w: number; h: number };
  /** Lower sorts first within a dock. */
  order: number;
}

const LEVEL_RANK: Record<Complexity, number> = { minimal: 0, standard: 1, advanced: 2 };
export const levelMeets = (level: Complexity, min: Complexity): boolean => (LEVEL_RANK[level] ?? 0) >= (LEVEL_RANK[min] ?? 0);

export const WIDGETS: readonly WidgetDef[] = [
  { id: "checklist", title: "Top-down checklist", minLevel: "minimal", defaultIn: ["prepare"], dock: "left", minSize: { w: 220, h: 160 }, order: 1 },
  { id: "layers", title: "Layers", minLevel: "minimal", defaultIn: ["prepare", "live", "analysis"], dock: "left", minSize: { w: 220, h: 200 }, order: 2 },
  { id: "levelsInbox", title: "Levels inbox", minLevel: "minimal", defaultIn: ["prepare"], dock: "right", minSize: { w: 240, h: 240 }, order: 1 },
  { id: "brief", title: "Decision Brief", minLevel: "minimal", defaultIn: ["live"], dock: "right", minSize: { w: 260, h: 200 }, order: 1 },
  { id: "changeFeed", title: "Market Change Feed", minLevel: "minimal", defaultIn: ["live"], dock: "right", minSize: { w: 260, h: 240 }, order: 2 },
  { id: "readiness", title: "Readiness chain", minLevel: "standard", defaultIn: ["live"], dock: "right", minSize: { w: 240, h: 160 }, order: 3 },
  { id: "journal", title: "Journal", minLevel: "minimal", defaultIn: ["review"], dock: "left", minSize: { w: 240, h: 240 }, order: 1 },
  { id: "scorecard", title: "Level scorecard", minLevel: "standard", defaultIn: ["review"], dock: "right", minSize: { w: 260, h: 220 }, order: 1 },
  { id: "evidenceTimeline", title: "Evidence timeline", minLevel: "standard", defaultIn: ["review"], dock: "bottom", minSize: { w: 360, h: 140 }, order: 1 },
  { id: "evidence", title: "Evidence drawer", minLevel: "minimal", defaultIn: ["analysis"], dock: "right", minSize: { w: 260, h: 240 }, order: 2 },
  { id: "confluence", title: "Confluence", minLevel: "standard", defaultIn: ["analysis"], dock: "right", minSize: { w: 260, h: 200 }, order: 3 },
  { id: "calendar", title: "Economic calendar", minLevel: "standard", defaultIn: ["live"], dock: "bottom", minSize: { w: 300, h: 120 }, order: 2 },
  { id: "sessions", title: "Session clock", minLevel: "standard", defaultIn: ["live"], dock: "bottom", minSize: { w: 220, h: 100 }, order: 3 },
  { id: "volatility", title: "ADR / volatility", minLevel: "standard", defaultIn: ["live"], dock: "bottom", minSize: { w: 220, h: 100 }, order: 5 },
  { id: "plan", title: "Trade plan", minLevel: "standard", defaultIn: ["live"], dock: "right", minSize: { w: 260, h: 200 }, order: 4 },
  { id: "methodology", title: "My Methodology", minLevel: "standard", defaultIn: ["analysis"], dock: "right", minSize: { w: 280, h: 260 }, order: 4 },
  { id: "replay", title: "Replay", minLevel: "standard", defaultIn: ["review"], dock: "bottom", minSize: { w: 300, h: 100 }, order: 2 },
];

const byId = new Map(WIDGETS.map((w) => [w.id, w]));
export const getWidget = (id: string): WidgetDef | undefined => byId.get(id);

/** Widgets visible by default for a workflow at a complexity level, dock-sorted. */
export function defaultWidgets(workflow: Workflow, level: Complexity): WidgetDef[] {
  return WIDGETS
    .filter((w) => w.defaultIn.includes(workflow) && levelMeets(level, w.minLevel))
    .sort((a, b) => a.dock.localeCompare(b.dock) || a.order - b.order);
}

/** Every widget available (addable) at a complexity level. */
export function availableWidgets(level: Complexity): WidgetDef[] {
  return WIDGETS.filter((w) => levelMeets(level, w.minLevel));
}