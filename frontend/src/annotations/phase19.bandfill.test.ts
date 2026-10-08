import { describe, expect, it } from "vitest";
import { AnnotationSchema, type Annotation } from "@/types/schemas";
import { toSpecs, type SpecContext } from "./toPrimitives";

const T = "2026-03-02T10:00:00Z";
const T2 = "2026-03-02T11:00:00Z";
const ctx: SpecContext = { resolve: (v) => `color(${v})`, pair: "EUR_USD", text: "#fff", bg: "#000", font: "mono" };
const base = { id: "a", role: "range", tone: "neutral", source_tf: "M15", step: 0, known_at: T };
const band = (o: Record<string, unknown>): Annotation => AnnotationSchema.parse({
  ...base, kind: "band",
  upper: [{ t: T, v: 2 }, { t: T2, v: 2.1 }],
  mid: [{ t: T, v: 1.5 }, { t: T2, v: 1.6 }],
  lower: [{ t: T, v: 1 }, { t: T2, v: 1.1 }],
  ...o,
});

describe("Phase 19 — band fill", () => {
  it("emits a bandfill shape with upper and reversed-lower edges on the price pane", () => {
    const specs = toSpecs([band({ pane: "price", fill: true })], ctx);
    const fill = specs.shapes.find((s) => s.type === "bandfill");
    expect(fill).toBeTruthy();
    if (fill?.type === "bandfill") {
      expect(fill.opts.upper).toHaveLength(2);
      expect(fill.opts.lower).toHaveLength(2);
    }
    // still emits the three native line indicators
    expect(specs.indicators.map((i) => i.id)).toEqual(["a:u", "a:m", "a:l"]);
  });

  it("omits the fill when fill is false", () => {
    const specs = toSpecs([band({ pane: "price", fill: false })], ctx);
    expect(specs.shapes.some((s) => s.type === "bandfill")).toBe(false);
  });

  it("omits the fill on a sub-pane (price-pane primitive only)", () => {
    const specs = toSpecs([band({ pane: "vol", fill: true })], ctx);
    expect(specs.shapes.some((s) => s.type === "bandfill")).toBe(false);
  });

  it("drops warm-up nulls from the fill edges", () => {
    const specs = toSpecs([band({
      pane: "price", fill: true,
      upper: [{ t: T, v: null }, { t: T2, v: 2.1 }],
      lower: [{ t: T, v: null }, { t: T2, v: 1.1 }],
    })], ctx);
    const fill = specs.shapes.find((s) => s.type === "bandfill");
    expect(fill?.type === "bandfill" && fill.opts.upper).toHaveLength(1);
  });
});
