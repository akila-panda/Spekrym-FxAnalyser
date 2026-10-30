import { useOverrideStore, type TradeOverride } from "@/annotations/overrides";
import { useAnnotationStore } from "@/store/annotationStore";
import { bindStore, isRecord, type Binding, type BindContext, type StoreLike } from "./bindStore";

// ---------- annotation: step position (annotations/steps are DERIVED from the active setup; hiddenGroups is window-scoped) ----------
export interface StepFields {
  step: number | null;
}

export function validateStep(raw: unknown): StepFields | null {
  if (!isRecord(raw)) return null;
  const { step } = raw;
  if (step === null) return { step: null };
  return typeof step === "number" && Number.isInteger(step) && step >= 1 ? { step } : null;
}

export function bindAnnotation(
  ctx: BindContext,
  store: StoreLike<StepFields> = useAnnotationStore as unknown as StoreLike<StepFields>,
): Binding {
  return bindStore<StepFields, StepFields>({
    ...ctx,
    slice: "annotation",
    store,
    pick: (s) => ({ step: s.step }),
    validate: validateStep,
    toPatch: (p) => ({ step: p.step }),
  });
}

// ---------- overrides: what-if trade edits ----------
export interface TradeFields {
  trades: Record<string, TradeOverride>;
}

const KEYS = ["entry", "stop", "target"] as const;

export function validateTrades(raw: unknown): TradeFields | null {
  if (!isRecord(raw) || !isRecord(raw.trades)) return null;
  const trades: Record<string, TradeOverride> = {};
  for (const [id, v] of Object.entries(raw.trades)) {
    if (!isRecord(v)) return null;
    const o: TradeOverride = {};
    for (const k of KEYS) {
      const n = v[k];
      if (n === undefined) continue;
      if (typeof n !== "number" || !Number.isFinite(n)) return null;
      o[k] = n;
    }
    trades[id] = o;
  }
  return { trades };
}

export function bindOverrides(
  ctx: BindContext,
  store: StoreLike<TradeFields> = useOverrideStore as unknown as StoreLike<TradeFields>,
): Binding {
  return bindStore<TradeFields, TradeFields>({
    ...ctx,
    slice: "overrides",
    store,
    pick: (s) => ({ trades: s.trades }),
    validate: validateTrades,
    equals: (a, b) => Object.is(a.trades, b.trades),
    toPatch: (p) => ({ trades: p.trades }),
  });
}