import { beforeEach, describe, expect, it } from "vitest";
import type { ComposedOverlay } from "../pipeline";
import { PREPARE_STEPS, applyPreset } from "./steps";
import { freezePlan } from "./plan";
import { usePrepareStore } from "./prepareStore";

const ov = (kind: string, ref: string): ComposedOverlay => ({
  key: ref, kind, sources: ["s"], stackCount: 0, priority: 2, evidenceCount: 0,
  primary: { mappingId: `map:${ref}`, sourceModule: "s", objectIds: [ref], overlayType: kind, geometryRefs: [ref], visibility: "visible", evidenceIds: [] },
});

describe("F5 steps + presets", () => {
  it("has six ordered steps ending in the session plan", () => {
    expect(PREPARE_STEPS).toHaveLength(6);
    expect(PREPARE_STEPS[5]!.id).toBe("plan");
    expect(PREPARE_STEPS[5]!.preset.selectedOnly).toBe(true);
  });

  it("a kind preset maps the chart to only its primitive kinds", () => {
    const overlays = [ov("level", "a"), ov("marker", "b"), ov("zone", "c")];
    expect(applyPreset(overlays, { kinds: ["level"] }).map((o) => o.kind)).toEqual(["level"]);
    expect(applyPreset(overlays, { kinds: ["marker", "zone"] })).toHaveLength(2);
  });

  it("the session-plan step shows only selected objects", () => {
    const overlays = [ov("level", "a"), ov("marker", "b")];
    expect(applyPreset(overlays, { selectedOnly: true }, ["b"]).map((o) => o.key)).toEqual(["b"]);
  });
});

describe("F5 freezePlan — immutable", () => {
  it("produces a deep-frozen plan that cannot be edited after the fact", () => {
    const plan = freezePlan({ pair: "EUR_USD", asOf: 100, reviewedSteps: ["htf"], selectedIds: ["a"] });
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.selectedIds)).toBe(true);
    expect(() => { (plan as unknown as { asOf: number }).asOf = 0; }).toThrow();
    expect(() => { (plan.selectedIds as string[]).push("x"); }).toThrow();
  });

  it("copies the input arrays (mutating the source does not touch the plan)", () => {
    const src = ["a"];
    const plan = freezePlan({ pair: "EUR_USD", asOf: 100, reviewedSteps: [], selectedIds: src });
    src.push("b");
    expect(plan.selectedIds).toEqual(["a"]);
  });
});

describe("F5 prepareStore", () => {
  beforeEach(() => usePrepareStore.getState().reset());

  it("clamps the step and marks reviewed, toggles selection, freezes from state", () => {
    const s = usePrepareStore.getState();
    s.setStep(99); expect(usePrepareStore.getState().stepIndex).toBe(5);
    s.markReviewed("htf"); s.toggleSelect("a"); s.toggleSelect("b"); s.toggleSelect("a"); // a off, b on
    expect(usePrepareStore.getState().selectedIds).toEqual(["b"]);
    usePrepareStore.getState().freeze({ pair: "EUR_USD", asOf: 500 });
    const plan = usePrepareStore.getState().plan!;
    expect(plan.selectedIds).toEqual(["b"]);
    expect(plan.reviewedSteps).toEqual(["htf"]);
    expect(Object.isFrozen(plan)).toBe(true);
  });
});
