import { describe, expect, it } from "vitest";
import { AnnotationSchema, type Annotation } from "@/types/schemas";
import { toSpecs, type SpecContext } from "./toPrimitives";

const T = "2026-03-02T10:00:00Z";
const T2 = "2026-03-02T11:00:00Z";
const ctx: SpecContext = { resolve: (v) => `color(${v})`, pair: "EUR_USD", text: "#fff", bg: "#000", font: "mono" };
const base = { id: "a", role: "entry", tone: "bull", source_tf: "M15", step: 0, known_at: T };
const mk = (o: Record<string, unknown>): Annotation => AnnotationSchema.parse({ ...base, ...o });

describe("Phase 16 rendering", () => {
  it("draws one level per fib ratio plus a highlight zone, at interpolated prices", () => {
    const specs = toSpecs([mk({
      kind: "fib_zone", anchor_a: { t: T, p: 1 }, anchor_b: { t: T2, p: 2 },
      levels: [0.5, 0.618], highlight_range: [0.5, 0.618],
    })], ctx);
    const levels = specs.shapes.filter((s) => s.type === "level");
    expect(levels).toHaveLength(2);
    // price at 0.5 of [1,2] = 1.5
    expect(levels[0]?.type === "level" && levels[0].opts.price).toBeCloseTo(1.5);
    expect(specs.shapes.filter((s) => s.type === "zone")).toHaveLength(1);
    expect(specs.texts.map((t) => t.text)).toEqual(expect.arrayContaining(["0.5", "0.618"]));
  });

  it("draws a forming pattern faint + dashed and labels vertices and name", () => {
    const specs = toSpecs([mk({
      kind: "polyline", complete: false, pattern_name: "Gartley", ratios: [0.618],
      points: [{ t: T, p: 1, label: "X" }, { t: T2, p: 2, label: "A" }],
    })], ctx);
    const line = specs.shapes.find((s) => s.type === "line");
    expect(line?.type === "line" && line.opts.emphasis).toBe("faint");
    expect(line?.type === "line" && line.opts.dash).toEqual([2, 2]);
    expect(specs.texts.map((t) => t.text)).toEqual(expect.arrayContaining(["X", "A", "Gartley (forming)"]));
  });

  it("draws a complete pattern at normal emphasis", () => {
    const specs = toSpecs([mk({
      kind: "polyline", complete: true, pattern_name: "Bat",
      points: [{ t: T, p: 1 }, { t: T2, p: 2 }],
    })], ctx);
    const line = specs.shapes.find((s) => s.type === "line");
    expect(line?.type === "line" && line.opts.emphasis).toBe("normal");
    expect(specs.texts.map((t) => t.text)).toContain("Bat");
  });
});
