import { describe, expect, it } from "vitest";
import { AnnotationSchema, type Annotation } from "@/types/schemas";
import { toSpecs, type SpecContext } from "./toPrimitives";

const T = "2026-03-02T10:00:00Z";
const T2 = "2026-03-02T11:00:00Z";
const ctx: SpecContext = { resolve: (v) => `color(${v})`, pair: "EUR_USD", text: "#fff", bg: "#000", font: "mono" };
const base = { id: "a", role: "structure", tone: "neutral", source_tf: "M15", step: 0, known_at: T };
const mk = (o: Record<string, unknown>): Annotation => AnnotationSchema.parse({ ...base, ...o });

describe("Phase 15 rendering", () => {
  it("applies an explicit dashed pattern to a line (BOS/CHoCH)", () => {
    const specs = toSpecs([mk({ kind: "line", dash: "dashed", points: [{ t: T, p: 1 }, { t: T2, p: 1 }] })], ctx);
    const line = specs.shapes.find((s) => s.type === "line");
    expect(line && "dash" in line.opts && line.opts.dash).toEqual([4, 3]);
  });

  it("draws a mitigated level faint and extended to the right", () => {
    const specs = toSpecs([mk({ kind: "level", t0: T, price: 1.1, state: "mitigated", extend: "right" })], ctx);
    const lvl = specs.shapes.find((s) => s.type === "level");
    expect(lvl?.type === "level" && lvl.opts.emphasis).toBe("faint");
    expect(lvl?.type === "level" && lvl.opts.end).toBe("right");
  });

  it("decomposes a banded zone into one zone per band plus an equilibrium level", () => {
    const specs = toSpecs([mk({
      kind: "banded_zone", t0: T, t1: T2, mid_price: 1.15,
      bands: [{ p_high: 1.2, p_low: 1.15, role: "premium_discount" }, { p_high: 1.15, p_low: 1.1, role: "premium_discount" }],
    })], ctx);
    expect(specs.shapes.filter((s) => s.type === "zone")).toHaveLength(2);
    expect(specs.shapes.filter((s) => s.type === "level")).toHaveLength(1);
    expect(specs.shapes.map((s) => s.id)).toEqual(["a:b0", "a:b1", "a:mid"]);
  });

  it("emits one marker per highlighted bar", () => {
    const specs = toSpecs([mk({ kind: "bar_highlight", bars: [T, T2] })], ctx);
    expect(specs.markers).toHaveLength(2);
    expect(specs.markers[0]!.shape).toBe("square");
  });
});
