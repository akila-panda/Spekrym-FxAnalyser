/** F7 — Review scorecard. Pure. Scores a session on FOUR independent axes — analysis quality, decision
 *  quality, process adherence, and trade outcome — each computed from its own slice of the input, so a
 *  losing trade can still have a sound process, and a win can follow a poor decision. They never blend. */
import type { SessionPlan } from "../prepare/plan";
import type { ChangeEvent } from "../live/diff";

export interface Axis {
  key: "analysis" | "decision" | "process" | "outcome";
  title: string;
  verdict: string;
  /** 0..1, independent per axis. */
  score: number;
  rationale: string;
}
export interface ReviewScorecard {
  analysis: Axis;
  decision: Axis;
  process: Axis;
  outcome: Axis;
}

export interface ReviewInput {
  totalSteps: number;
  reviewedStepCount: number;
  hadInvalidation: boolean;
  followedMethodology: boolean;
  thesisSupportedAtEntry: boolean;
  conflictsOverlooked: number;
  reactedToInvalidation: boolean;
  outcome: { result: "win" | "loss" | "flat"; r: number };
}

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

// Each axis reads ONLY its own fields — this is what keeps the four independent.
function analysisAxis(i: ReviewInput): Axis {
  return {
    key: "analysis", title: "Analysis quality",
    verdict: i.thesisSupportedAtEntry ? "Sound" : "Weak", score: i.thesisSupportedAtEntry ? 1 : 0,
    rationale: i.thesisSupportedAtEntry ? "thesis was supported by information available at the time" : "thesis was not supported by information available at the time",
  };
}
function decisionAxis(i: ReviewInput): Axis {
  const score = clamp01((i.reactedToInvalidation ? 0.5 : 0) + (i.conflictsOverlooked === 0 ? 0.5 : 0));
  const verdict = score >= 1 ? "Good" : i.conflictsOverlooked > 0 ? "Overlooked signals" : "Slow to react";
  return { key: "decision", title: "Decision quality", verdict, score, rationale: `${i.conflictsOverlooked} conflicting signal(s) overlooked; ${i.reactedToInvalidation ? "reacted to changes" : "did not react to invalidation"}` };
}
function processAxis(i: ReviewInput): Axis {
  const ratio = i.totalSteps > 0 ? i.reviewedStepCount / i.totalSteps : 0;
  const score = clamp01(ratio * 0.6 + (i.hadInvalidation ? 0.2 : 0) + (i.followedMethodology ? 0.2 : 0));
  const verdict = score >= 0.8 ? "Adherent" : score >= 0.5 ? "Partial" : "Lax";
  return { key: "process", title: "Process adherence", verdict, score, rationale: `${i.reviewedStepCount}/${i.totalSteps} steps reviewed; invalidation ${i.hadInvalidation ? "defined" : "missing"}; methodology ${i.followedMethodology ? "followed" : "not followed"}` };
}
function outcomeAxis(i: ReviewInput): Axis {
  const score = i.outcome.result === "win" ? 1 : i.outcome.result === "flat" ? 0.5 : 0;
  return { key: "outcome", title: "Trade outcome", verdict: i.outcome.result, score, rationale: `${i.outcome.r >= 0 ? "+" : ""}${i.outcome.r}R` };
}

/** Build the four-axis scorecard. Each axis is derived independently. */
export function buildReview(i: ReviewInput): ReviewScorecard {
  return { analysis: analysisAxis(i), decision: decisionAxis(i), process: processAxis(i), outcome: outcomeAxis(i) };
}

/** Deterministic sample review input derived from the frozen plan + the change feed. */
export function sampleReviewInput(plan: SessionPlan, feed: readonly ChangeEvent[]): ReviewInput {
  const unexpected = feed.filter((e) => e.category === "unexpected").length;
  return {
    totalSteps: 6,
    reviewedStepCount: plan.reviewedSteps.length,
    hadInvalidation: true,
    followedMethodology: true,
    thesisSupportedAtEntry: true,
    conflictsOverlooked: unexpected > 1 ? 1 : 0,
    reactedToInvalidation: !feed.some((e) => e.category === "invalidated"),
    outcome: { result: "loss", r: -1 }, // a losing trade with a sound process (the point of 4 axes)
  };
}
