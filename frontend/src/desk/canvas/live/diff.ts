/** F6 — Live / Monitor. Pure. The frozen SessionPlan is Live's start state; incoming live facts are
 *  CLASSIFIED against it (expected / unexpected / confirmed / invalidated / deteriorated / no-change) and a
 *  Before/Now comparison is derived — all WITHOUT ever mutating or rewriting the frozen plan/thesis. */
import type { SessionPlan } from "../prepare/plan";

export type LiveFactKind = "level_reached" | "level_broken" | "confirmation" | "invalidation" | "conditions_degraded";
export type ChangeCategory = "expected" | "unexpected" | "confirmed" | "invalidated" | "deteriorated" | "no_change";

export interface LiveFact {
  id: string;
  t: number;
  kind: LiveFactKind;
  targetId?: string;
  detail?: string;
}

export interface ChangeEvent {
  id: string;
  t: number;
  category: ChangeCategory;
  targetId?: string;
  inPlan: boolean;
  note: string;
}

const NOTE: Record<ChangeCategory, string> = {
  expected: "a planned level was reached",
  unexpected: "a level broke that was not expected to",
  confirmed: "a predefined confirmation condition was met",
  invalidated: "an explicit invalidation condition triggered",
  deteriorated: "conditions deteriorated (spread / volatility / data / event risk)",
  no_change: "no meaningful change",
};

/** Classify one fact against the (frozen) plan. Pure; reads the plan, never writes it. */
export function classifyFact(fact: LiveFact, plan: SessionPlan): ChangeEvent {
  const inPlan = fact.targetId !== undefined && plan.selectedIds.includes(fact.targetId);
  let category: ChangeCategory;
  switch (fact.kind) {
    case "invalidation": category = "invalidated"; break;
    case "confirmation": category = "confirmed"; break;
    case "conditions_degraded": category = "deteriorated"; break;
    case "level_reached": category = inPlan ? "expected" : "unexpected"; break;
    case "level_broken": category = "unexpected"; break;
    default: category = "no_change";
  }
  return { id: fact.id, t: fact.t, category, ...(fact.targetId !== undefined ? { targetId: fact.targetId } : {}), inPlan, note: NOTE[category] };
}

/** The Market Change Feed: every fact classified against the plan, time-ordered. Plan untouched. */
export function buildChangeFeed(plan: SessionPlan, facts: readonly LiveFact[]): ChangeEvent[] {
  return facts.map((f) => classifyFact(f, plan)).sort((a, b) => a.t - b.t);
}

export interface BeforeNow {
  before: { selectedIds: readonly string[]; asOf: number };
  now: { counts: Record<ChangeCategory, number>; reachedIds: string[] };
  /** False once any invalidation fires. The frozen thesis itself is never changed. */
  thesisIntact: boolean;
}

export function beforeNow(plan: SessionPlan, facts: readonly LiveFact[]): BeforeNow {
  const events = buildChangeFeed(plan, facts);
  const counts: Record<ChangeCategory, number> = {
    expected: 0, unexpected: 0, confirmed: 0, invalidated: 0, deteriorated: 0, no_change: 0,
  };
  const reachedIds: string[] = [];
  for (const e of events) {
    counts[e.category]++;
    if (e.category === "expected" && e.targetId) reachedIds.push(e.targetId);
  }
  return {
    before: { selectedIds: plan.selectedIds, asOf: plan.asOf },
    now: { counts, reachedIds },
    thesisIntact: counts.invalidated === 0,
  };
}

/** Deterministic sample live facts relative to a plan (a real feed replaces this). */
export function sampleLiveFacts(plan: SessionPlan): LiveFact[] {
  const base = plan.asOf;
  const tgt = plan.selectedIds[0];
  const facts: LiveFact[] = [];
  if (tgt) {
    facts.push({ id: "lf1", t: base + 300, kind: "level_reached", targetId: tgt });
    facts.push({ id: "lf2", t: base + 600, kind: "confirmation", targetId: tgt });
  }
  facts.push({ id: "lf3", t: base + 900, kind: "level_broken", targetId: "unplanned" });
  facts.push({ id: "lf4", t: base + 1200, kind: "conditions_degraded" });
  return facts;
}
