/** DESK DK14 — readiness chain: ordered steps toward "ready to review" for the focus object. Default chain = OQ-1 default
 *  (zone entered → lower-TF sweep → lower-TF CHoCH/BOS → lower-TF FVG), configurable by passing another `chain`
 *  (the methodology editor is DK17). Each step: pending · seen@time · failed · unavailable, with what is missing.
 *  Steps must occur in order, after the previous step, inside the window. Descriptive only. */
import { fmtTime } from "@/desk/evidence/describe";
import { structureKind } from "@/desk/detect/structure/kinds";
import { lifecycleState } from "@/desk/kernel/viewAsOf";
import { distanceToObject } from "@/desk/layers/relevance";
import type { AnalysisObject } from "@/desk/types/schemas";
import { TF_SECONDS, PAIR_META, type Pair, type Timeframe } from "@/types/market";

export type StepId = "zone" | "sweep" | "break" | "fvg";
export interface ChainStepDef { id: StepId; label: string }
export const DEFAULT_CHAIN: readonly ChainStepDef[] = [
  { id: "zone", label: "Higher-timeframe zone entered" },
  { id: "sweep", label: "Lower-timeframe liquidity sweep" },
  { id: "break", label: "Lower-timeframe CHoCH/BOS in the zone's direction" },
  { id: "fvg", label: "Lower-timeframe FVG in the zone's direction" },
];
export const READINESS = { windowSec: 24 * 3600, radiusAtr: 1.0 } as const;
export type StepStatus = "pending" | "seen" | "failed" | "unavailable";
export interface ReadinessStep { id: StepId; label: string; status: StepStatus; t?: number; objectId?: string; missing?: string }
export interface Readiness { focusId: string | null; steps: ReadinessStep[]; complete: boolean }

const ENTER = new Set(["partially_mitigated", "tested", "partially_filled"]);
const DEAD = new Set(["invalidated", "broken", "inverted"]);
const rank = (o: AnalysisObject): number => TF_SECONDS[o.source_tf as Timeframe];

function gap(a: AnalysisObject, b: AnalysisObject): number | null {
  if (!a.geometry.bands.length || !b.geometry.bands.length) return null;
  const lo = (o: AnalysisObject) => Math.min(...o.geometry.bands.map((x) => x.pLow));
  const hi = (o: AnalysisObject) => Math.max(...o.geometry.bands.map((x) => x.pHigh));
  return Math.max(0, Math.max(lo(a), lo(b)) - Math.min(hi(a), hi(b)));
}

export interface ReadinessInput {
  pair: Pair; focus: AnalysisObject | null; objects: readonly AnalysisObject[]; ref: number; price: number | null; atr: number | null;
  chain?: readonly ChainStepDef[];
}

export function buildReadiness(i: ReadinessInput): Readiness {
  const chain = (i.chain ?? DEFAULT_CHAIN).filter((s) => ["zone", "sweep", "break", "fvg"].includes(s.id));
  const f = i.focus;
  if (!f || i.atr === null || i.atr <= 0) {
    return { focusId: null, steps: chain.map((s) => ({ ...s, status: "pending" as const, missing: "No focus object yet — see the Decision Brief." })), complete: false };
  }
  const ref = Number.isFinite(i.ref) ? i.ref : f.known_at;
  const floor = ref - READINESS.windowSec;
  const dead = DEAD.has(lifecycleState(f) ?? "") ? f.lifecycle.filter((e) => DEAD.has(e.kind)).sort((a, b) => b.t - a.t)[0] : undefined;
  const steps: ReadinessStep[] = [];
  let prevT = Math.max(f.known_at, floor);
  let broken = false;
  const eligible = (o: AnalysisObject) => o.known_at >= prevT && o.known_at <= ref && o.known_at >= floor && (() => { const g = gap(f, o); return g !== null && g <= READINESS.radiusAtr * i.atr!; })();
  const earliest = (list: AnalysisObject[]): AnalysisObject | undefined => list.sort((a, b) => a.known_at - b.known_at || (a.id < b.id ? -1 : 1))[0];

  for (const def of chain) {
    const step: ReadinessStep = { ...def, status: "pending" };
    if (!f.direction && (def.id === "break" || def.id === "fvg")) { steps.push({ ...step, status: "unavailable", missing: "Direction is not defined for this object." }); continue; }
    if (broken) { steps.push({ ...step, missing: "Waiting for the previous step." }); continue; }
    if (def.id === "zone") {
      const entry = f.lifecycle.filter((e) => ENTER.has(e.kind)).sort((a, b) => a.known_at - b.known_at)[0];
      const inside = i.price !== null && distanceToObject(f, i.price) === 0;
      if (entry) { step.status = "seen"; step.t = entry.known_at; step.objectId = f.id; prevT = Math.max(prevT, entry.known_at); }
      else if (inside) { step.status = "seen"; step.t = ref; step.objectId = f.id; prevT = Math.max(prevT, ref); }
      else {
        const d = i.price !== null ? distanceToObject(f, i.price) : null;
        step.missing = d === null ? "No price yet." : `Price is ${(d / PAIR_META[i.pair].pip).toFixed(1)} pips from the zone.`;
      }
    } else if (def.id === "sweep") {
      const hit = earliest(i.objects.filter((o) => o.type === "sweep" && rank(o) <= rank(f) && eligible(o)));
      if (hit) { step.status = "seen"; step.t = hit.known_at; step.objectId = hit.id; prevT = hit.known_at; } else step.missing = "No sweep near the zone since the previous step.";
    } else if (def.id === "break") {
      const hit = earliest(i.objects.filter((o) => { const k = structureKind(o); return (k === "BOS" || k === "CHoCH") && o.direction === f.direction && rank(o) < rank(f) && eligible(o); }));
      if (hit) { step.status = "seen"; step.t = hit.known_at; step.objectId = hit.id; prevT = hit.known_at; } else step.missing = "No lower-timeframe structure break in that direction yet.";
    } else {
      const hit = earliest(i.objects.filter((o) => o.type === "fvg" && o.direction === f.direction && rank(o) < rank(f) && eligible(o)));
      if (hit) { step.status = "seen"; step.t = hit.known_at; step.objectId = hit.id; prevT = hit.known_at; } else step.missing = "No lower-timeframe FVG in that direction yet.";
    }
    if (step.status === "pending" || step.status === "unavailable") {
      if (dead && step.status === "pending") { step.status = "failed"; step.missing = `Zone ${dead.kind} at ${fmtTime(dead.t)}.`; }
      if (step.status === "pending") broken = true;
    }
    steps.push(step);
  }
  return { focusId: f.id, steps, complete: steps.length > 0 && steps.every((s) => s.status === "seen" || s.status === "unavailable") && steps.some((s) => s.status === "seen") };
}