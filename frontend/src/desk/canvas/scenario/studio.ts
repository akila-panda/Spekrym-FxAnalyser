/** F11 — Scenario Studio (VI-4), pure + causal. Turns ScenarioSpecification / ScenarioState /
 *  ForecastDistribution into a view model. Honesty rules enforced here, not in the UI:
 *  - Category B (conditional) NEVER carries a number; Category C (forecast) shows numbers only when a
 *    calibrated model backs it, otherwise they are withheld (never fabricated).
 *  - Nothing is visible before spec.asOf / state.availableAt; a branch past its expiry is expired.
 *  - Invalidations are always listed (P0); chart focus resolves only to real, knowable object geometry. */
import type { AnalysisObject } from "@/desk/types/schemas";
import type { ChartMapping, ForecastDistribution, ScenarioSpecification, ScenarioState } from "@/intel/contracts";
import { objectToPrimitive, type VisualPrimitive } from "../rendering/primitives";

export type ScenarioCategory = "B" | "C";
export type BranchStatus = "proposed" | "active" | "triggered" | "invalidated" | "expired";

export interface BranchView {
  index: number;
  label: string;
  status: BranchStatus;
  conditions: { text: string; fired: boolean }[];
  invalidation: { text: string; broken: boolean };
  expiry: number;
  horizon: number;
  geometryRefs: string[];
}

export interface ForecastView {
  /** "calibrated" → numbers may show; "withheld" → no numbers, reason given. */
  state: "calibrated" | "withheld";
  reason?: string;
  distribution?: Record<string, number>;
  interval?: { lo: number; hi: number };
  calibration?: ForecastDistribution["calibration"];
}

export interface ScenarioView {
  id: string;
  version: string;
  category: ScenarioCategory;
  asOf: number;
  sourceEngine: string;
  status: BranchStatus;
  branches: BranchView[];
  /** Earlier versions (revision = new version, history stays visible). */
  history: { version: string; asOf: number }[];
  forecast?: ForecastView;
  /** P0: any broken invalidation on any branch. */
  invalidated: boolean;
}

const vnum = (v: string): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

/** Latest ScenarioState per (scenarioId, version) knowable at asOf. */
function stateFor(states: readonly ScenarioState[], id: string, version: string, asOf: number): ScenarioState | null {
  let best: ScenarioState | null = null;
  for (const s of states) {
    if (s.scenarioId !== id || s.version !== version || s.availableAt > asOf) continue;
    if (!best || s.availableAt >= best.availableAt) best = s;
  }
  return best;
}

/** Category-C gate: numbers only when a forecast with the same modelRef has real OOS calibration. */
export function forecastGate(spec: ScenarioSpecification, forecasts: readonly ForecastDistribution[], asOf: number): ForecastView {
  if (!spec.modelRef) return { state: "withheld", reason: "No model reference — numbers withheld." };
  const f = forecasts.find((x) => x.modelRef === spec.modelRef && x.instrument === spec.instrument && x.asOf <= asOf);
  if (!f) return { state: "withheld", reason: "No forecast available yet — numbers withheld." };
  const c = f.calibration;
  if (c.sampleSize <= 0 || c.oosReliability <= 0) {
    return { state: "withheld", reason: "Model not calibrated out-of-sample — numbers withheld.", calibration: c };
  }
  return {
    state: "calibrated", calibration: c,
    ...(f.distribution ? { distribution: f.distribution } : {}),
    ...(f.interval ? { interval: f.interval } : {}),
  };
}

function branchViews(spec: ScenarioSpecification, st: ScenarioState | null, asOf: number): BranchView[] {
  return spec.branches.map((b, index) => {
    const fired = new Set(st?.firedConditions ?? []);
    const broken = new Set(st?.brokenInvalidations ?? []);
    const invalidationBroken = broken.has(b.invalidation) || broken.has(b.label) || st?.status === "invalidated";
    let status: BranchStatus = st?.status ?? "proposed";
    if (invalidationBroken) status = "invalidated";
    else if (asOf >= b.expiry) status = "expired";
    return {
      index, label: b.label, status,
      conditions: b.conditions.map((text) => ({ text, fired: fired.has(text) })),
      invalidation: { text: b.invalidation, broken: invalidationBroken },
      expiry: b.expiry, horizon: b.horizon, geometryRefs: [...b.geometryRefs],
    };
  });
}

/** Causal studio view: latest knowable version per scenario id; older versions kept as history. */
export function buildStudio(
  specs: readonly ScenarioSpecification[],
  states: readonly ScenarioState[],
  forecasts: readonly ForecastDistribution[],
  asOf: number,
): ScenarioView[] {
  const known = specs.filter((s) => s.asOf <= asOf);
  const byId = new Map<string, ScenarioSpecification[]>();
  for (const s of known) byId.set(s.id, [...(byId.get(s.id) ?? []), s]);
  const out: ScenarioView[] = [];
  for (const [id, versions] of byId) {
    const sorted = [...versions].sort((a, b) => vnum(a.version) - vnum(b.version) || a.asOf - b.asOf);
    const spec = sorted[sorted.length - 1]!;
    const st = stateFor(states, id, spec.version, asOf);
    const branches = branchViews(spec, st, asOf);
    const category: ScenarioCategory = spec.kind === "forecast" ? "C" : "B";
    const status: BranchStatus = branches.some((b) => b.status === "invalidated") ? "invalidated"
      : branches.every((b) => b.status === "expired") ? "expired" : st?.status ?? "proposed";
    out.push({
      id, version: spec.version, category, asOf: spec.asOf, sourceEngine: spec.sourceEngine, status, branches,
      history: sorted.slice(0, -1).map((s) => ({ version: s.version, asOf: s.asOf })),
      ...(category === "C" ? { forecast: forecastGate(spec, forecasts, asOf) } : {}),
      invalidated: branches.some((b) => b.invalidation.broken),
    });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

export interface ScenarioFocus {
  mappings: ChartMapping[];
  primitives: VisualPrimitive[];
  /** Refs that could not be drawn (missing object or not yet knowable) — shown as text, never invented. */
  unresolved: string[];
}

/** Selecting a scenario branch → focused chart mappings + primitives from REAL, knowable object geometry. */
export function scenarioFocus(view: ScenarioView | null, branchIndex: number, objects: readonly AnalysisObject[], asOf: number): ScenarioFocus {
  const empty: ScenarioFocus = { mappings: [], primitives: [], unresolved: [] };
  const branch = view?.branches[branchIndex];
  if (!view || !branch) return empty;
  const index = new Map(objects.map((o) => [o.id, o]));
  const out: ScenarioFocus = { mappings: [], primitives: [], unresolved: [] };
  for (const ref of branch.geometryRefs) {
    const o = index.get(ref);
    if (!o || o.known_at > asOf) { out.unresolved.push(ref); continue; }
    out.mappings.push({
      mappingId: `scn:${view.id}:${branch.index}:${ref}`, sourceModule: "scenario", objectIds: [ref],
      overlayType: view.category === "C" ? "forecast" : "scenario", geometryRefs: [ref],
      focusTimeRange: [Math.max(asOf, o.t_event), Math.max(asOf, branch.expiry)],
      visibility: "focused", evidenceIds: [], scenarioId: view.id,
    });
    out.primitives.push(objectToPrimitive(o, { to: Math.max(branch.expiry, ...o.geometry.anchorTimes) }));
  }
  return out;
}