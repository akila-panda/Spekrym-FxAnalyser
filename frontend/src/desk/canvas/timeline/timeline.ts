/** F12 — Intelligence Timeline + Replay (VI-6). Pure + causal. Builds one ordered timeline of how
 *  intelligence evolved (insights, objects, scenarios, regime) and replays it by stepping an as-of cursor.
 *  Honesty: every entry is labelled exactly one of "recorded" (captured live) or "reconstructed" (rebuilt
 *  after the fact) — the default is reconstructed, never recorded. Causality: an entry exists only once
 *  availableAt <= asOf, so rehydrate(t) is always a prefix of the full timeline (replay/live parity). */
import type { AnalysisObject } from "@/desk/types/schemas";
import type { IntelligenceInsight, RegimeSnapshot, ScenarioSpecification } from "@/intel/contracts";

export type TimelineOrigin = "recorded" | "reconstructed";
export type TimelineSource = "insight" | "object" | "scenario" | "regime";

export interface TimelineEntry {
  id: string;
  source: TimelineSource;
  label: string;
  /** When the thing happened / was observed (UTC s). */
  t: number;
  /** When it became knowable (UTC s); the entry is hidden before this. */
  availableAt: number;
  origin: TimelineOrigin;
}

export interface TimelineInput {
  insights?: readonly IntelligenceInsight[];
  objects?: readonly AnalysisObject[];
  scenarios?: readonly ScenarioSpecification[];
  regimes?: readonly RegimeSnapshot[];
  /** Ids captured live. Anything not listed is reconstructed (never assumed recorded). */
  recordedIds?: ReadonlySet<string>;
}

/** The full timeline (all knowable-at-any-time entries), ordered by availability then id. */
export function buildTimeline(input: TimelineInput): TimelineEntry[] {
  const rec = input.recordedIds ?? new Set<string>();
  const origin = (id: string): TimelineOrigin => (rec.has(id) ? "recorded" : "reconstructed");
  const out: TimelineEntry[] = [];
  for (const i of input.insights ?? []) {
    out.push({ id: i.id, source: "insight", label: `${i.sourceEngine} ${i.kind}`, t: i.observedAt, availableAt: i.availableAt, origin: origin(i.id) });
  }
  for (const o of input.objects ?? []) {
    out.push({ id: o.id, source: "object", label: `${o.type.replace(/_/g, " ")} established`, t: o.t_event, availableAt: o.known_at, origin: origin(o.id) });
  }
  for (const s of input.scenarios ?? []) {
    const id = `${s.id}:v${s.version}`;
    out.push({ id, source: "scenario", label: `Scenario ${s.id} v${s.version}`, t: s.asOf, availableAt: s.asOf, origin: origin(id) });
  }
  for (const r of input.regimes ?? []) {
    out.push({ id: r.id, source: "regime", label: `Market state → ${r.structure_state}`, t: r.t_event, availableAt: r.available_at, origin: origin(r.id) });
  }
  return out.sort((a, b) => a.availableAt - b.availableAt || a.id.localeCompare(b.id));
}

/** Rehydrate the timeline at an as-of: only what was knowable then (null = live/latest). */
export function rehydrate(entries: readonly TimelineEntry[], asOf: number | null): TimelineEntry[] {
  return asOf === null ? [...entries] : entries.filter((e) => e.availableAt <= asOf);
}

/** Distinct replay positions (ascending availableAt). */
export function replaySteps(entries: readonly TimelineEntry[]): number[] {
  return [...new Set(entries.map((e) => e.availableAt))].sort((a, b) => a - b);
}

/** True when the cursor is at (or past) the latest step — i.e. live. */
export const isLive = (steps: readonly number[], asOf: number | null): boolean =>
  asOf === null || steps.length === 0 || asOf >= (steps[steps.length - 1] as number);

/** Step the cursor one position. Stepping forward onto the last step returns null (live). Pure. */
export function stepAsOf(steps: readonly number[], asOf: number | null, dir: 1 | -1): number | null {
  if (steps.length === 0) return null;
  const last = steps.length - 1;
  let idx = isLive(steps, asOf) ? last : steps.filter((s) => s <= (asOf as number)).length - 1;
  idx = Math.max(0, Math.min(last, idx + dir));
  return idx >= last ? null : (steps[idx] as number);
}

export const counts = (entries: readonly TimelineEntry[]): Record<TimelineOrigin, number> => ({
  recorded: entries.filter((e) => e.origin === "recorded").length,
  reconstructed: entries.filter((e) => e.origin === "reconstructed").length,
});