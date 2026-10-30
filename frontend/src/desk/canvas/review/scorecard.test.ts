import { describe, expect, it } from "vitest";
import { buildReview, type ReviewInput } from "./scorecard";

const BASE: ReviewInput = {
  totalSteps: 6, reviewedStepCount: 6, hadInvalidation: true, followedMethodology: true,
  thesisSupportedAtEntry: true, conflictsOverlooked: 0, reactedToInvalidation: true,
  outcome: { result: "loss", r: -1 },
};

describe("F7 review scorecard — four axes", () => {
  it("a losing trade can still score a sound analysis and adherent process", () => {
    const r = buildReview(BASE);
    expect(r.outcome.verdict).toBe("loss");
    expect(r.outcome.score).toBe(0);
    expect(r.analysis.verdict).toBe("Sound");
    expect(r.process.verdict).toBe("Adherent");
    expect(r.decision.verdict).toBe("Good");
  });

  it("axes are independent — changing only the outcome moves only the outcome axis", () => {
    const loss = buildReview(BASE);
    const win = buildReview({ ...BASE, outcome: { result: "win", r: 2 } });
    expect(win.analysis).toEqual(loss.analysis);
    expect(win.decision).toEqual(loss.decision);
    expect(win.process).toEqual(loss.process);
    expect(win.outcome.verdict).toBe("win");
    expect(win.outcome).not.toEqual(loss.outcome);
  });

  it("changing only process inputs moves only the process axis", () => {
    const lax = buildReview({ ...BASE, reviewedStepCount: 1, hadInvalidation: false, followedMethodology: false });
    const full = buildReview(BASE);
    expect(lax.analysis).toEqual(full.analysis);
    expect(lax.outcome).toEqual(full.outcome);
    expect(lax.process.verdict).toBe("Lax");
    expect(full.process.verdict).toBe("Adherent");
  });

  it("decision axis reflects overlooked conflicts independently", () => {
    const overlooked = buildReview({ ...BASE, conflictsOverlooked: 2 });
    expect(overlooked.decision.verdict).toBe("Overlooked signals");
    expect(overlooked.process).toEqual(buildReview(BASE).process);
  });
});
