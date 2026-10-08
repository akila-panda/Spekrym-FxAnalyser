import { beforeEach, describe, expect, it } from "vitest";
import { applyTradeOverrides, useOverrideStore, whatIfR } from "./overrides";
import { AnnotationSchema, type Annotation } from "@/types/schemas";

const T = "2026-03-02T10:00:00Z";
const trade = (o: Record<string, unknown> = {}): Annotation =>
  AnnotationSchema.parse({
    id: "t1", kind: "trade", role: "entry", tone: "bull", source_tf: "M15", step: 0, known_at: T,
    t0: T, t1: T, direction: "long", entry: 100, stop: 90, target: 120, ...o,
  });

describe("whatIfR", () => {
  it("computes R for a long (reward/risk)", () => {
    expect(whatIfR("long", 100, 90, 120)).toBeCloseTo(2); // risk 10, reward 20
  });
  it("computes R for a short", () => {
    expect(whatIfR("short", 100, 110, 80)).toBeCloseTo(2); // risk 10, reward 20
  });
  it("returns null when risk is zero or inverted", () => {
    expect(whatIfR("long", 100, 100, 120)).toBeNull();
    expect(whatIfR("long", 100, 110, 120)).toBeNull();
  });
});

describe("applyTradeOverrides", () => {
  it("leaves trades without an override untouched", () => {
    const out = applyTradeOverrides([trade()], {});
    expect(out[0]).toEqual(trade());
  });
  it("merges overridden fields and tags the label", () => {
    const out = applyTradeOverrides([trade({ label: "+2R" })], { t1: { stop: 95 } });
    const t = out[0]!;
    expect(t.kind === "trade" && t.stop).toBe(95);
    expect(t.kind === "trade" && t.entry).toBe(100);
    expect(t.label).toBe("+2R (edited)");
  });
  it("ignores non-trade annotations", () => {
    const level = AnnotationSchema.parse({ id: "l", kind: "level", role: "bias", tone: "neutral", source_tf: "M15", step: 0, known_at: T, t0: T, price: 1 });
    expect(applyTradeOverrides([level], { l: { entry: 5 } })[0]).toEqual(level);
  });
});

describe("useOverrideStore", () => {
  beforeEach(() => useOverrideStore.setState({ trades: {} }));
  it("sets, merges, resets one, and resets all", () => {
    const s = useOverrideStore.getState();
    s.setTrade("t1", { entry: 101 });
    s.setTrade("t1", { stop: 95 });
    expect(useOverrideStore.getState().trades.t1).toEqual({ entry: 101, stop: 95 });
    s.setTrade("t2", { target: 200 });
    useOverrideStore.getState().resetTrade("t1");
    expect(useOverrideStore.getState().trades.t1).toBeUndefined();
    expect(useOverrideStore.getState().trades.t2).toEqual({ target: 200 });
    useOverrideStore.getState().resetAll();
    expect(useOverrideStore.getState().trades).toEqual({});
  });
});
