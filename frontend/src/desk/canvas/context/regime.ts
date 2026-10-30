/** F9 — Regime strip + analytical-family context (W3.5). Pure. Causal: a snapshot is known only once
 *  available_at <= asOf. Qualitative only (D10): direction probabilities are NEVER surfaced and numeric
 *  fields are shown as low/moderate/high bands. Regime ≠ HTF alignment ≠ execution conditions — three
 *  separate groups, never collapsed into one label. Families feed context panels, not chart clutter. */
import type { RegimeSnapshot } from "@/intel/contracts";

export type Band = "low" | "moderate" | "high";
export const band = (x: number): Band => (x < 0.34 ? "low" : x < 0.67 ? "moderate" : "high");

const known = (s: RegimeSnapshot, asOf: number): boolean => s.available_at <= asOf && s.t_event <= asOf;

/** Snapshots knowable at asOf for one instrument, oldest first. */
export function knownSnapshots(series: readonly RegimeSnapshot[], asOf: number, instrument?: string): RegimeSnapshot[] {
  return series
    .filter((s) => known(s, asOf) && (!instrument || s.instrument === instrument))
    .sort((a, b) => a.t_event - b.t_event || a.available_at - b.available_at);
}

/** The regime in force at the viewed time: latest snapshot known by asOf, or null. */
export function regimeAt(series: readonly RegimeSnapshot[], asOf: number, instrument?: string): RegimeSnapshot | null {
  const k = knownSnapshots(series, asOf, instrument);
  return k[k.length - 1] ?? null;
}

export interface StripSegment { id: string; from: number; state: RegimeSnapshot["structure_state"]; degraded: boolean; current: boolean }

export function stripSegments(series: readonly RegimeSnapshot[], asOf: number, instrument?: string): StripSegment[] {
  const k = knownSnapshots(series, asOf, instrument);
  return k.map((s, i) => ({
    id: s.id, from: s.t_event, state: s.structure_state, degraded: s.data_quality !== "valid", current: i === k.length - 1,
  }));
}

export interface RegimeDescription {
  regime: { structure: string; volatility: string; trend: Band; momentum: string };
  htf: { alignment: string };
  execution: { dataQuality: string; transitionRisk: Band };
}

export function describeRegime(s: RegimeSnapshot): RegimeDescription {
  return {
    regime: { structure: s.structure_state, volatility: s.volatility_state, trend: band(s.trend_strength), momentum: s.momentum_state },
    htf: { alignment: s.timeframe_alignment },
    execution: { dataQuality: s.data_quality, transitionRisk: band(s.transition_risk) },
  };
}

/** P0: degraded/absent regime data is always surfaced. */
export function regimeWarning(s: RegimeSnapshot | null): string | null {
  if (!s) return null;
  return s.data_quality === "valid" ? null : `Regime data ${s.data_quality} — treat context as unreliable.`;
}

export interface FamilyRow { label: string; value: string }
export interface FamilyPanel { id: string; title: string; status: "ok" | "unavailable"; rows: FamilyRow[]; note?: string }

/** Analytical-family context panels derived from the snapshot. Conditional families degrade gracefully. */
export function familyPanels(s: RegimeSnapshot | null): FamilyPanel[] {
  const unavailable = (id: string, title: string, note: string): FamilyPanel => ({ id, title, status: "unavailable", rows: [], note });
  return [
    s
      ? { id: "trend", title: "Trend & momentum", status: "ok", rows: [{ label: "Trend strength", value: band(s.trend_strength) }, { label: "Momentum", value: s.momentum_state }] }
      : unavailable("trend", "Trend & momentum", "No regime known yet at this time."),
    s
      ? { id: "volatility", title: "Volatility state", status: "ok", rows: [{ label: "State", value: s.volatility_state }] }
      : unavailable("volatility", "Volatility state", "No regime known yet at this time."),
    unavailable("statistical", "Statistical behaviour", "Unavailable — no validated, calibrated model (D10)."),
    unavailable("relative", "Relative strength", "Unavailable — needs the broader instrument set."),
    unavailable("volume", "Volume / auction", "Unavailable — no central FX volume (proxy only)."),
    unavailable("options", "Options", "Unavailable — licensed data not connected."),
  ];
}