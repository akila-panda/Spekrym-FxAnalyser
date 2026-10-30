import { describe, expect, it } from "vitest";
import { mkObj } from "@/desk/__fixtures__/objects";
import { defaultSettingsMap } from "./layerStore";
import { selectForView, type SelectInput } from "./projection";

const allOn = () => {
  const s = defaultSettingsMap();
  for (const k of Object.keys(s) as (keyof typeof s)[]) s[k].visible = true;
  return s;
};
const sel = (o: Partial<SelectInput> & Pick<SelectInput, "objects">): SelectInput => ({
  viewTf: "M5", asOf: Infinity, settings: allOn(), complexity: "standard", price: 1.1005, atrView: 0.001, ...o,
});
const round = (lo: number, tf: "M5" | "D" = "M5") =>
  mkObj({ type: "reference_level", layer: "levels", source_tf: tf, lo, hi: lo, grade: { significance: 0.1, relevance: null, quality: null, freshness: null, factors: [{ id: "label", label: "Round 1.1000", status: "supports" }] } });

describe("G2-A projected quota", () => {
  const nat = Array.from({ length: 20 }, () => mkObj({ source_tf: "M5", grade: { significance: 0.9, relevance: null, quality: null, freshness: null, factors: [] } }));
  const prj = Array.from({ length: 5 }, () => mkObj({ source_tf: "D", lo: 1.1, hi: 1.101 }));
  it("standard keeps 2 projected slots per layer inside the cap of 8", () => {
    const r = selectForView(sel({ objects: [...nat, ...prj] }));
    expect(r.objects).toHaveLength(8);
    expect(r.projected.size).toBe(2);
  });
  it("advanced keeps the quota inside 20", () => {
    const r = selectForView(sel({ objects: [...nat, ...prj], complexity: "advanced" }));
    expect(r.objects).toHaveLength(20);
    expect(r.projected.size).toBe(2);
  });
  it("minimal: 3 total with 1 quiet higher-TF object", () => {
    const r = selectForView(sel({ objects: [...nat, ...prj], complexity: "minimal" }));
    expect(r.objects).toHaveLength(3);
    expect(r.projected.size).toBe(1);
  });
  it("spare slots fall back to natives; projections only fill what exists", () => {
    const few = selectForView(sel({ objects: [...nat.slice(0, 3), prj[0]!] }));
    expect(few.objects).toHaveLength(4);
    const onlyProj = selectForView(sel({ objects: prj }));
    expect(onlyProj.objects).toHaveLength(5);
  });
  it("never draws a lower-TF object on a higher TF", () => {
    expect(selectForView(sel({ objects: nat, viewTf: "H1" })).objects).toEqual([]);
  });
});

describe("G2-B round numbers only inside the relevance window", () => {
  it("drops far native round levels, keeps near ones and other far native levels", () => {
    const near = round(1.1);
    const far = round(1.5);
    const farSr = mkObj({ type: "sr_level", layer: "levels", source_tf: "M5", lo: 1.5, hi: 1.501 });
    const ids = selectForView(sel({ objects: [near, far, farSr] })).objects.map((o) => o.id);
    expect(ids).toContain(near.id);
    expect(ids).toContain(farSr.id);
    expect(ids).not.toContain(far.id);
  });
  it("without price/ATR nothing is dropped", () => {
    expect(selectForView(sel({ objects: [round(1.5)], price: null, atrView: null })).objects).toHaveLength(1);
  });
});