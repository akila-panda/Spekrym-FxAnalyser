/** F13 — Cross-engine integration (VI-7). Pure + causal. Brings every engine's output (observed objects,
 *  regime, scenarios/forecasts, trade/strategy signals, macro, Master Brain proposals) into ONE list of
 *  items, each typed as exactly one of the 5 evidence types with a distinct visual identity.
 *  Honesty: discretionary/unvalidated ≠ validated signal; an uncalibrated forecast is never typed as a
 *  calibrated forecast; brain output is a proposal; items without real price/time geometry are
 *  "context only" (never invented onto the chart); nothing appears before it was knowable. */
import type { AnalysisObject } from "@/desk/types/schemas";
import type {
  EligibilityDecision, ForecastDistribution, IntelligenceInsight, RegimeSnapshot, ScenarioSpecification, ScenarioState, TradeRecord,
} from "@/intel/contracts";
import { regimeAt } from "../context/regime";
import { buildStudio } from "../scenario/studio";

export const EVIDENCE_TYPES = ["observed_fact", "interpretation", "conditional_scenario", "calibrated_forecast", "validated_signal"] as const;
export type EvidenceType = (typeof EVIDENCE_TYPES)[number];

export interface Identity { glyph: string; name: string; border: "solid" | "dotted" | "dashed" | "double" | "thick" }
/** The five identities: pairwise-distinct glyph, name and border shape (never colour alone). */
export const IDENTITY: Record<EvidenceType, Identity> = {
  observed_fact: { glyph: "●", name: "Observed fact", border: "solid" },
  interpretation: { glyph: "◈", name: "Interpretation", border: "dotted" },
  conditional_scenario: { glyph: "◇", name: "Conditional scenario", border: "dashed" },
  calibrated_forecast: { glyph: "▣", name: "Calibrated forecast", border: "double" },
  validated_signal: { glyph: "★", name: "Validated signal", border: "thick" },
};

export type EngineId = "observed" | "regime" | "scenario" | "forecast" | "strategy" | "macro" | "brain" | string;

export interface EngineItem {
  id: string;
  engine: EngineId;
  evidenceType: EvidenceType;
  label: string;
  t: number;
  availableAt: number;
  /** "chart" only when it resolves to real price/time geometry; otherwise a context panel / timeline. */
  surface: "chart" | "context";
  /** P0 (invalidation / scheduled-event risk): never hidden. */
  p0: boolean;
  /** True for anything not backed by a validated strategy tier — shown as discretionary. */
  discretionary: boolean;
  hypothetical?: boolean;
  proposal?: boolean;
  note?: string;
}

export interface EngineLayerInput {
  objects?: readonly AnalysisObject[];
  insights?: readonly IntelligenceInsight[];
  regimes?: readonly RegimeSnapshot[];
  scenarios?: readonly ScenarioSpecification[];
  scenarioStates?: readonly ScenarioState[];
  forecasts?: readonly ForecastDistribution[];
  trades?: readonly TradeRecord[];
  eligibility?: readonly EligibilityDecision[];
  instrument?: string;
  /** UTC s; Infinity = latest. */
  asOf?: number;
}

const VALIDATED = new Set(["validated", "vault_confirmed"]);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function insightItem(i: IntelligenceInsight): EngineItem {
  const base = { id: i.id, engine: i.sourceEngine, t: i.observedAt, availableAt: i.availableAt, surface: (i.objectIds.length > 0 ? "chart" : "context") as EngineItem["surface"], discretionary: false };
  const label = `${i.sourceEngine} ${i.kind.replace("_", " ")}`;
  switch (i.kind) {
    case "observation": return { ...base, evidenceType: "observed_fact", label, p0: false };
    case "risk_warning": return { ...base, evidenceType: "observed_fact", label, p0: i.status !== "expired" && i.status !== "invalidated" };
    case "scenario": return { ...base, evidenceType: "conditional_scenario", label, p0: false };
    // An insight alone carries no calibration evidence → never typed as a calibrated forecast.
    case "forecast": return { ...base, evidenceType: "interpretation", label, p0: false, note: "forecast without calibration evidence — shown as interpretation" };
    default: return { ...base, evidenceType: "interpretation", label, p0: false, ...(i.sourceEngine === "brain" ? { proposal: true, discretionary: true, note: "proposal — not validated" } : {}) };
  }
}

/** All engines → typed items knowable at asOf. P0 first, then newest-available first. */
export function buildEngineLayer(input: EngineLayerInput): EngineItem[] {
  const asOf = input.asOf ?? Infinity;
  const out: EngineItem[] = [];

  for (const o of input.objects ?? []) {
    if (o.known_at > asOf) continue;
    out.push({ id: o.id, engine: "observed", evidenceType: "observed_fact", label: o.type.replace(/_/g, " "), t: o.t_event, availableAt: o.known_at, surface: "chart", p0: false, discretionary: false });
  }
  for (const i of input.insights ?? []) if (i.availableAt <= asOf) out.push(insightItem(i));

  const reg = input.regimes ? regimeAt(input.regimes, asOf, input.instrument) : null;
  if (reg) {
    out.push({ id: reg.id, engine: "regime", evidenceType: "interpretation", label: `regime: ${reg.structure_state} · vol ${reg.volatility_state}`, t: reg.t_event, availableAt: reg.available_at, surface: "context", p0: reg.data_quality !== "valid", discretionary: false, ...(reg.data_quality !== "valid" ? { note: `data ${reg.data_quality}` } : {}) });
  }

  for (const v of buildStudio(input.scenarios ?? [], input.scenarioStates ?? [], input.forecasts ?? [], asOf)) {
    const spec = (input.scenarios ?? []).find((s) => s.id === v.id && s.version === v.version);
    const hasGeo = v.branches.some((b) => b.geometryRefs.length > 0);
    const calibrated = v.category === "C" && v.forecast?.state === "calibrated";
    out.push({
      id: `${v.id}:v${v.version}`, engine: v.category === "C" ? "forecast" : "scenario",
      evidenceType: calibrated ? "calibrated_forecast" : "conditional_scenario",
      label: `scenario ${v.id} v${v.version} (${v.status})`, t: v.asOf, availableAt: spec?.asOf ?? v.asOf,
      surface: hasGeo ? "chart" : "context", p0: v.invalidated, discretionary: false,
      ...(v.category === "C" && !calibrated ? { note: "uncalibrated model — numbers withheld" } : {}),
    });
  }

  for (const tr of input.trades ?? []) {
    if (tr.entry_time > asOf) continue;
    const tier = input.eligibility?.find((e) => e.strategy_id === tr.strategy_id && e.strategy_version === tr.strategy_version)?.evidence_tier;
    const validated = tier !== undefined && VALIDATED.has(tier);
    const hyp = tr.category === "counterfactual";
    out.push({
      id: tr.trade_id, engine: "strategy", evidenceType: validated && !hyp ? "validated_signal" : "interpretation",
      label: `${tr.category} ${tr.direction} ${tr.strategy_id}`, t: tr.entry_time, availableAt: tr.entry_time,
      surface: "chart", p0: false, discretionary: !validated,
      ...(hyp ? { hypothetical: true, note: "hypothetical — never a result" } : {}),
      ...(!validated ? { note: hyp ? "hypothetical — never a result" : `${tier ?? "no tier"} — not validated` } : {}),
    });
  }

  return out.sort((a, b) => Number(b.p0) - Number(a.p0) || b.availableAt - a.availableAt || a.id.localeCompare(b.id));
}

/** Distinct engines present (sorted) — GF3: every engine's output is readable in the one list. */
export const enginesIn = (items: readonly EngineItem[]): string[] => [...new Set(items.map((i) => i.engine))].sort();
export const typeLabel = (t: EvidenceType): string => cap(IDENTITY[t].name);