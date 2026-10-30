/** DX11: command registry. Pure: the context and actions are injected. Every command mirrors a visible control. */
import { MODE_LABELS, MODES, type Mode } from "@/components/layout/modes";
import type { Timeframe } from "@/types/market";
import { fuzzyScore } from "./fuzzy";

export type CommandGroup = "Windows" | "View" | "Mode" | "Desk" | "Setups" | "Presets" | "Help";
export type DeskAreaId = "my" | "analysis";
export type DeskWorkflowId = "prepare" | "live" | "review";
export type DeskComplexityId = "minimal" | "standard" | "advanced";
export const POP_ROLES = ["charts", "setups", "stack"] as const;
export type PopRole = (typeof POP_ROLES)[number];

export interface Command {
  id: string;
  title: string;
  group: CommandGroup;
  /** Muted second line. */
  detail?: string;
  /** Extra words the search also matches (ranked below the title). */
  keywords?: string;
  run: () => void;
}

export interface SetupRef {
  key: string;
  tf: Timeframe;
  id: string;
  label: string;
}

export interface CommandContext {
  pair: string;
  pairs: readonly string[];
  linked: boolean;
  mode: Mode;
  popped: ReadonlySet<string>;
  /** The setups in list order (1-based position = the number in "Go to setup N"). */
  setups: readonly SetupRef[];
  rowToggles: readonly { tf: Timeframe; visible: boolean }[];
  presets: readonly string[];
  deskApp: "scan" | "desk";
  deskArea: DeskAreaId;
  deskWorkflow: DeskWorkflowId;
}

export interface CommandActions {
  setPair: (pair: string) => void;
  toggleLinked: () => void;
  togglePopout: (role: PopRole) => void;
  goToSetup: (ref: SetupRef) => void;
  setMode: (mode: Mode) => void;
  toggleRow: (tf: Timeframe) => void;
  restorePreset: (name: string) => void;
  savePreset: (name: string) => void;
  openShortcuts: () => void;
  openDeskArea: (area: DeskAreaId) => void;
  backToScan: () => void;
  setDeskWorkflow: (wf: DeskWorkflowId) => void;
  setComplexity: (c: DeskComplexityId) => void;
  toggleDeskFocus: () => void;
  deskSimplify: () => void;
}

export const MAX_SETUP_COMMANDS = 300;
export const MAX_RESULTS = 50;
const pairLabel = (p: string): string => p.replace("_", "/");

export function buildCommands(ctx: CommandContext, act: CommandActions): Command[] {
  const out: Command[] = [];

  for (const role of POP_ROLES) {
    const isOut = ctx.popped.has(role);
    out.push({
      id: `window:${role}`,
      title: `${isOut ? "Re-dock" : "Pop out"} ${role}`,
      group: "Windows",
      keywords: "window popout dock monitor",
      run: () => act.togglePopout(role),
    });
  }

  out.push({
    id: "view:linked",
    title: `Turn Linked ${ctx.linked ? "off" : "on"}`,
    group: "View",
    detail: ctx.linked ? "Charts stay put when you pick a setup" : "Charts follow the selected setup",
    keywords: "link sync follow",
    run: act.toggleLinked,
  });

  const visibleCount = ctx.rowToggles.filter((r) => r.visible).length;
  for (const r of ctx.rowToggles) {
    if (r.visible && visibleCount <= 1) continue; // at least one row stays visible
    out.push({
      id: `row:${r.tf}`,
      title: `${r.visible ? "Hide" : "Show"} row ${r.tf}`,
      group: "View",
      keywords: "stack timeframe rows",
      run: () => act.toggleRow(r.tf),
    });
  }

  for (const p of ctx.pairs) {
    if (p === ctx.pair) continue;
    out.push({ id: `pair:${p}`, title: `Switch pair: ${pairLabel(p)}`, group: "View", keywords: "symbol instrument", run: () => act.setPair(p) });
  }

  for (const m of MODES) {
    if (m === ctx.mode) continue;
    out.push({ id: `mode:${m}`, title: `Mode: ${MODE_LABELS[m]}`, group: "Mode", keywords: "workbench preset layout", run: () => act.setMode(m) });
  }

  ctx.setups.slice(0, MAX_SETUP_COMMANDS).forEach((s, i) => {
    out.push({ id: `setup:${s.key}`, title: `Go to setup ${i + 1}`, group: "Setups", detail: s.label, keywords: s.label, run: () => act.goToSetup(s) });
  });

  for (const name of ctx.presets) {
    out.push({ id: `preset:${name}`, title: `Restore preset: ${name}`, group: "Presets", keywords: "workspace view saved", run: () => act.restorePreset(name) });
  }

  const cap = (w: string) => w[0]!.toUpperCase() + w.slice(1);
  if (ctx.deskApp === "scan") {
    out.push({ id: "desk:my", title: "Desk: Open MY DESK", group: "Desk", keywords: "desk analysis prepare", run: () => act.openDeskArea("my") });
    out.push({ id: "desk:analysis", title: "Desk: Open Analysis", group: "Desk", keywords: "desk free chart", run: () => act.openDeskArea("analysis") });
  } else {
    out.push({ id: "desk:scan", title: "Desk: Back to Scan", group: "Desk", keywords: "scan", run: act.backToScan });
    (["my", "analysis"] as const).forEach((a) => { if (a !== ctx.deskArea) out.push({ id: `desk:area:${a}`, title: `Desk: ${a === "my" ? "MY DESK" : "Analysis"}`, group: "Desk", run: () => act.openDeskArea(a) }); });
    if (ctx.deskArea === "my") (["prepare", "live", "review"] as const).forEach((w) => { if (w !== ctx.deskWorkflow) out.push({ id: `desk:wf:${w}`, title: `Desk: ${cap(w)}`, group: "Desk", keywords: "workflow", run: () => act.setDeskWorkflow(w) }); });
    out.push({ id: "desk:focus", title: "Desk: Focus", group: "Desk", keywords: "hide widgets", run: act.toggleDeskFocus });
    out.push({ id: "desk:simplify", title: "Desk: Simplify", group: "Desk", keywords: "minimal", run: act.deskSimplify });
    (["minimal", "standard", "advanced"] as const).forEach((c) => out.push({ id: `desk:cx:${c}`, title: `Desk: Complexity ${cap(c)}`, group: "Desk", keywords: "level", run: () => act.setComplexity(c) }));
  }

  out.push({ id: "help:shortcuts", title: "Show keyboard shortcuts", group: "Help", keywords: "keys help ?", run: act.openShortcuts });
  return out;
}

const GOTO_RE = /^(?:go\s*(?:to)?\s*)?(?:setup\s*)?#?(\d+)$/i;
const SAVE_RE = /^save(?:\s+preset)?\s+(.+)$/i;

/** Commands that take the query as an argument: a bare number or "go to setup N", and "save <name>". */
export function argCommands(query: string, ctx: CommandContext, act: CommandActions): Command[] {
  const q = query.trim();
  const out: Command[] = [];
  const save = SAVE_RE.exec(q);
  if (save?.[1]) {
    const name = save[1].trim();
    out.push({ id: "arg:save", title: `Save preset "${name}"`, group: "Presets", detail: "Current view and open windows", run: () => act.savePreset(name) });
  }
  const go = GOTO_RE.exec(q);
  const n = go?.[1] ? Number(go[1]) : 0;
  const target = n >= 1 ? ctx.setups[n - 1] : undefined;
  if (target) out.push({ id: "arg:goto", title: `Go to setup ${n}`, group: "Setups", detail: target.label, run: () => act.goToSetup(target) });
  return out;
}

/** Results for a query: argument commands first, then fuzzy matches (title ranks above keywords). Empty query lists everything except the long setup list. */
export function searchCommands(commands: readonly Command[], query: string, ctx: CommandContext, act: CommandActions, limit = MAX_RESULTS): Command[] {
  const q = query.trim();
  if (!q) return commands.filter((c) => c.group !== "Setups").slice(0, limit);
  const extra = argCommands(q, ctx, act);
  const dupe = new Set(extra.filter((c) => c.id === "arg:goto").map((c) => `setup:${ctx.setups[Number(/\d+/.exec(c.title)?.[0]) - 1]?.key}`));
  const scored = commands
    .filter((c) => !dupe.has(c.id))
    .map((c, i) => {
      const t = fuzzyScore(q, c.title);
      const k = t === null && c.keywords ? fuzzyScore(q, c.keywords) : null;
      return { c, i, s: t ?? (k === null ? null : k - 30) };
    })
    .filter((r): r is { c: Command; i: number; s: number } => r.s !== null)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((r) => r.c);
  return [...extra, ...scored].slice(0, limit);
}