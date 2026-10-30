/** F4 — Spatial & Temporal Mapper. Pure, DOM-free. Turns a causal AnalysisObject (real geometry) into a
 *  typed visual primitive, and provides constructors for the non-object intelligence types (session shade,
 *  regime interval, risk window, dashed scenario path, uncertainty envelope, conflict marker). The renderer
 *  (later phase) draws these; this module only decides shape + placement, and never places the future. */
import type { AnalysisObject } from "@/desk/types/schemas";

export interface Pt { t: number; p: number }
export interface Ribbon { t: number; pLow: number; pHigh: number }

export type VisualPrimitive =
  | { kind: "level"; price: number; from: number; to: number; label?: string }
  | { kind: "zone"; pHigh: number; pLow: number; from: number; to: number; label?: string }
  | { kind: "line"; points: Pt[]; label?: string }
  | { kind: "marker"; t: number; price?: number; glyph: string; label?: string }
  | { kind: "event_marker"; t: number; price?: number; glyph: string; label?: string }
  | { kind: "session_shade"; from: number; to: number; label?: string }
  | { kind: "regime_interval"; from: number; to: number; label?: string }
  | { kind: "risk_window"; from: number; to: number; label?: string }
  | { kind: "path"; points: Pt[]; dashed: true; label?: string }
  | { kind: "envelope"; points: Ribbon[]; label?: string }
  | { kind: "conflict"; t: number; price?: number; label?: string };

export const PRIMITIVE_KINDS = [
  "level", "zone", "line", "marker", "event_marker", "session_shade",
  "regime_interval", "risk_window", "path", "envelope", "conflict",
] as const;

const LEVEL_TYPES = new Set(["sr_level", "reference_level", "liquidity_pool"]);
const ZONE_TYPES = new Set(["fvg", "sd_zone", "range"]);
const LINE_TYPES = new Set(["trendline", "impulse", "structure_event"]);

export interface ObjOptions {
  /** Right edge (UTC s) levels/zones extend to; default the object's latest anchor. */
  to?: number;
  label?: string;
}

/** One AnalysisObject → one VisualPrimitive. Pure; causality is enforced by `primitivesFor`. */
export function objectToPrimitive(o: AnalysisObject, opts: ObjOptions = {}): VisualPrimitive {
  const anchors = o.geometry.anchorTimes;
  const from = Math.min(...anchors);
  const to = opts.to ?? Math.max(...anchors);
  const band = o.geometry.bands[0];
  const pts = o.geometry.points ?? [];
  const label = opts.label;

  if (LEVEL_TYPES.has(o.type)) {
    const price = band ? (band.pHigh === band.pLow ? band.pHigh : (band.pHigh + band.pLow) / 2) : pts[0]?.p ?? 0;
    return { kind: "level", price, from, to, ...(label ? { label } : {}) };
  }
  if (ZONE_TYPES.has(o.type) && band) {
    return { kind: "zone", pHigh: band.pHigh, pLow: band.pLow, from, to, ...(label ? { label } : {}) };
  }
  if (o.type === "sweep") {
    return { kind: "event_marker", t: from, ...(band ? { price: band.pHigh } : {}), glyph: "✕", ...(label ? { label } : {}) };
  }
  if (LINE_TYPES.has(o.type)) {
    const points: Pt[] = pts.length >= 2 ? pts
      : [{ t: from, p: band?.pHigh ?? pts[0]?.p ?? 0 }, { t: to, p: band?.pLow ?? pts[0]?.p ?? 0 }];
    return { kind: "line", points, ...(label ? { label } : {}) };
  }
  // swing / candle_signal / relation / fallback
  return { kind: "marker", t: from, ...(band ? { price: band.pHigh } : pts[0] ? { price: pts[0].p } : {}), glyph: "•", ...(label ? { label } : {}) };
}

/** Objects → primitives, causally filtered: an object appears only once its known_at <= asOf. */
export function primitivesFor(objects: readonly AnalysisObject[], opts: ObjOptions & { asOf?: number } = {}): VisualPrimitive[] {
  const asOf = opts.asOf ?? Infinity;
  const to = opts.to ?? asOf;
  return objects.filter((o) => o.known_at <= asOf).map((o) => objectToPrimitive(o, { ...(Number.isFinite(to) ? { to } : {}) }));
}

/* ---- constructors for the non-object intelligence types ---- */
export const sessionShade = (from: number, to: number, label?: string): VisualPrimitive =>
  ({ kind: "session_shade", from, to, ...(label ? { label } : {}) });
export const regimeInterval = (from: number, to: number, label?: string): VisualPrimitive =>
  ({ kind: "regime_interval", from, to, ...(label ? { label } : {}) });
export const riskWindow = (from: number, to: number, label?: string): VisualPrimitive =>
  ({ kind: "risk_window", from, to, ...(label ? { label } : {}) });
export const conflictMarker = (t: number, price?: number, label?: string): VisualPrimitive =>
  ({ kind: "conflict", t, ...(price !== undefined ? { price } : {}), ...(label ? { label } : {}) });

/** Dashed conditional scenario path. `asOf` guards against drawing a branch into the past. */
export function scenarioPath(points: Pt[], asOf: number, label?: string): VisualPrimitive | null {
  const fwd = points.filter((pt) => pt.t >= asOf);
  if (fwd.length === 0) return null;
  return { kind: "path", points: fwd, dashed: true, ...(label ? { label } : {}) };
}

export const uncertaintyEnvelope = (points: Ribbon[], label?: string): VisualPrimitive =>
  ({ kind: "envelope", points, ...(label ? { label } : {}) });
