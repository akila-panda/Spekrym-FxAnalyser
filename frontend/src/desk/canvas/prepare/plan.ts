/** F5 — the frozen session plan. The output of Prepare: an immutable snapshot of the trader's selected
 *  objects, reviewed steps, as-of and rules version. Deep-frozen so it can never be edited after the market
 *  moves (conceptually the DESK Prepare snapshot, scoped to the Canvas). */
export interface SessionPlan {
  readonly pair: string;
  readonly asOf: number;
  readonly createdAt: number;
  readonly reviewedSteps: readonly string[];
  readonly selectedIds: readonly string[];
  readonly rulesVersion: string;
}

export interface FreezeInput {
  pair: string;
  asOf: number;
  createdAt?: number;
  reviewedSteps: readonly string[];
  selectedIds: readonly string[];
  rulesVersion?: string;
}

/** Build an immutable SessionPlan. Arrays are copied + frozen; the object is frozen. */
export function freezePlan(input: FreezeInput): SessionPlan {
  const plan: SessionPlan = {
    pair: input.pair,
    asOf: input.asOf,
    createdAt: input.createdAt ?? input.asOf,
    reviewedSteps: Object.freeze([...input.reviewedSteps]),
    selectedIds: Object.freeze([...input.selectedIds]),
    rulesVersion: input.rulesVersion ?? "sample-0",
  };
  return Object.freeze(plan);
}

export const isPlanFrozen = (p: SessionPlan): boolean => Object.isFrozen(p) && Object.isFrozen(p.selectedIds);
