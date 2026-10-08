import { describe, expect, it } from "vitest";
import { AnnotationSchema, PaneSchema, StrategyDefSchema } from "./schemas";

const T = "2026-03-02T10:00:00Z";
const base = { id: "a", role: "liquidity", tone: "neutral", source_tf: "H1", step: 0, known_at: T };
const ann = (o: Record<string, unknown>) => AnnotationSchema.parse({ ...base, ...o });

describe("Contract v2 — catalog fields", () => {
  const strat = {
    id: "orb", name: "ORB", description: "", display_tz: "UTC",
    supported_timeframes: ["M5"], context_timeframes: [], params: [],
  };

  it("defaults the three catalog fields to absent (treated as price_only by the UI)", () => {
    const s = StrategyDefSchema.parse(strat);
    expect(s.signal_class).toBeUndefined();
    expect(s.indicators_used).toBeUndefined();
    expect(s.requires_data).toBeUndefined();
  });

  it("accepts a hybrid strategy with indicators and data requirements", () => {
    const s = StrategyDefSchema.parse({
      ...strat, signal_class: "hybrid", indicators_used: ["ATR(14)"], requires_data: ["volume"],
    });
    expect(s.signal_class).toBe("hybrid");
    expect(s.indicators_used).toEqual(["ATR(14)"]);
  });

  it("rejects an unknown signal_class", () => {
    expect(() => StrategyDefSchema.parse({ ...strat, signal_class: "psychic" })).toThrow();
  });
});

describe("Contract v2 — new primitives", () => {
  it("parses a banded zone", () => {
    const a = ann({ kind: "banded_zone", t0: T, t1: T, bands: [{ p_high: 1.2, p_low: 1.1, role: "premium_discount" }], mid_price: 1.15 });
    expect(a.kind).toBe("banded_zone");
  });

  it("parses a fib zone with levels", () => {
    const a = ann({ kind: "fib_zone", anchor_a: { t: T, p: 1 }, anchor_b: { t: T, p: 2 }, levels: [0.618, 1.272] });
    expect(a.kind === "fib_zone" && a.levels).toEqual([0.618, 1.272]);
  });

  it("parses a bar highlight", () => {
    expect(ann({ kind: "bar_highlight", bars: [T, T] }).kind).toBe("bar_highlight");
  });

  it("parses a series with null warm-up points on a sub-pane", () => {
    const a = ann({ kind: "series", pane: "rsi", style: "line", points: [{ t: T, v: null }, { t: T, v: 55 }] });
    expect(a.kind === "series" && a.pane).toBe("rsi");
  });

  it("parses a band and defaults fill to true", () => {
    const a = ann({ kind: "band", upper: [{ t: T, v: 2 }], mid: [{ t: T, v: 1.5 }], lower: [{ t: T, v: 1 }] });
    expect(a.kind === "band" && a.fill).toBe(true);
    expect(a.kind === "band" && a.pane).toBe("price");
  });

  it("defaults pattern polyline complete to true and carries ratios", () => {
    const a = ann({ kind: "polyline", points: [{ t: T, p: 1 }, { t: T, p: 2 }], ratios: [0.618], pattern_name: "Gartley" });
    expect(a.kind === "polyline" && a.complete).toBe(true);
  });
});

describe("Contract v2 — ray extras, plot_time, panes", () => {
  it("accepts dash / extend / state / mitigated_at on a level", () => {
    const a = ann({ kind: "level", t0: T, price: 1.1, dash: "dashed", extend: "right", state: "mitigated", mitigated_at: T });
    expect(a.kind === "level" && a.state).toBe("mitigated");
  });

  it("carries plot_time separate from known_at", () => {
    const later = "2026-03-03T10:00:00Z";
    const a = ann({ kind: "level", t0: T, price: 1.1, plot_time: later });
    expect(a.plot_time).not.toBe(a.known_at);
  });

  it("parses a pane descriptor with guides and auto scale", () => {
    const p = PaneSchema.parse({ id: "rsi", title: "RSI 14", guides: [30, 70] });
    expect(p.scale).toBe("auto");
    expect(p.guides).toEqual([30, 70]);
  });
});
