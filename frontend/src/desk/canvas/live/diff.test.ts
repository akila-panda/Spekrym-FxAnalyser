import { describe, expect, it } from "vitest";
import { freezePlan } from "../prepare/plan";
import { beforeNow, buildChangeFeed, classifyFact, sampleLiveFacts, type LiveFact } from "./diff";

const PLAN = freezePlan({ pair: "EUR_USD", asOf: 1000, reviewedSteps: ["htf"], selectedIds: ["a"] });

describe("F6 classify facts against the plan", () => {
  it("maps each kind to the right category, in-plan vs not", () => {
    const cat = (f: LiveFact) => classifyFact(f, PLAN).category;
    expect(cat({ id: "1", t: 1, kind: "level_reached", targetId: "a" })).toBe("expected");
    expect(cat({ id: "2", t: 1, kind: "level_reached", targetId: "x" })).toBe("unexpected");
    expect(cat({ id: "3", t: 1, kind: "level_broken", targetId: "a" })).toBe("unexpected");
    expect(cat({ id: "4", t: 1, kind: "confirmation", targetId: "a" })).toBe("confirmed");
    expect(cat({ id: "5", t: 1, kind: "invalidation" })).toBe("invalidated");
    expect(cat({ id: "6", t: 1, kind: "conditions_degraded" })).toBe("deteriorated");
  });

  it("builds a time-ordered change feed", () => {
    const facts: LiveFact[] = [
      { id: "b", t: 20, kind: "confirmation", targetId: "a" },
      { id: "a", t: 10, kind: "level_reached", targetId: "a" },
    ];
    expect(buildChangeFeed(PLAN, facts).map((e) => e.id)).toEqual(["a", "b"]);
  });
});

describe("F6 Before/Now", () => {
  it("thesis intact until an invalidation fires; tracks reached planned levels", () => {
    const ok = beforeNow(PLAN, [{ id: "1", t: 1, kind: "level_reached", targetId: "a" }]);
    expect(ok.thesisIntact).toBe(true);
    expect(ok.now.reachedIds).toEqual(["a"]);
    const broken = beforeNow(PLAN, [{ id: "2", t: 1, kind: "invalidation" }]);
    expect(broken.thesisIntact).toBe(false);
    expect(broken.now.counts.invalidated).toBe(1);
  });

  it("the frozen plan is never rewritten by any Live computation", () => {
    const snapshot = JSON.stringify(PLAN);
    buildChangeFeed(PLAN, sampleLiveFacts(PLAN));
    beforeNow(PLAN, sampleLiveFacts(PLAN));
    expect(Object.isFrozen(PLAN)).toBe(true);
    expect(JSON.stringify(PLAN)).toBe(snapshot);
    expect(PLAN.selectedIds).toEqual(["a"]);
  });
});

describe("F6 sample live facts", () => {
  it("are deterministic and reference the plan's first selected object", () => {
    const facts = sampleLiveFacts(PLAN);
    expect(facts.some((f) => f.kind === "level_reached" && f.targetId === "a")).toBe(true);
    expect(facts.some((f) => f.kind === "conditions_degraded")).toBe(true);
  });
});
