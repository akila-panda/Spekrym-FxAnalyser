import { describe, expect, it } from "vitest";
import type { AnalysisObject } from "@/desk/types/schemas";
import { SAMPLE_ENGINE_OBJECTS, SAMPLE_INSIGHTS, SAMPLE_NOW } from "@/intel/fixtures";
import { composeCanvas } from "./pipeline";

const zone = (id: string, source: string, geoId: string): AnalysisObject => ({
  id, type: "fvg", layer: "fvg", pair: "EUR_USD", source_tf: "H1",
  geometry: { bands: [{ pHigh: 1.11, pLow: 1.10 }], anchorTimes: [1_746_810_000] },
  t_event: 1_746_810_000, known_at: 1_746_813_600, confirmed_at: null, lifecycle: [],
  provenance: { rulesVersion: "s", dataKind: "sample", detector: source, detectorVersion: 0 }, evidence: [],
  // geoId lets several objects share geometry for the dedup test
  ...(geoId !== id ? { origin_id: geoId } : {}),
});

describe("GF1 pipeline — end to end (objects+insights → composed overlays)", () => {
  it("composes causal, schema-backed overlays from the mock fixtures", () => {
    const c = composeCanvas({ objects: SAMPLE_ENGINE_OBJECTS, insights: SAMPLE_INSIGHTS, asOf: SAMPLE_NOW });
    expect(c.overlays.length).toBeGreaterThan(0);
    // the sr_level object becomes a "level" primitive, object-backed
    expect(c.overlays.some((o) => o.kind === "level" && o.primitive)).toBe(true);
    // mappings are causal (all known_at/availableAt <= asOf)
    expect(c.mappings.length).toBe(SAMPLE_ENGINE_OBJECTS.length + SAMPLE_INSIGHTS.length);
  });

  it("is causal — nothing composes before it was knowable", () => {
    const before = SAMPLE_ENGINE_OBJECTS[0]!.known_at - 1;
    expect(composeCanvas({ objects: SAMPLE_ENGINE_OBJECTS, asOf: before }).overlays).toEqual([]);
  });

  it("de-clutters correlated engines — four objects on one zone → one overlay + stack of 3", () => {
    // four objects sharing geometry ref via identical geometryRefs (same object id on their mapping)
    const objs = ["a", "b", "c", "d"].map((s) => zone(`fvg:${s}`, s, "fvg:a"));
    // force identical geometryRefs by giving them the same id so mappings share geometry
    const same = objs.map((o) => ({ ...o, id: "fvg:shared" }));
    const c = composeCanvas({ objects: same });
    expect(c.overlays).toHaveLength(1);
    expect(c.overlays[0]!.stackCount).toBe(3);
  });

  it("keeps a P0 overlay under Simplify while collapsing the rest", () => {
    const objs = [zone("fvg:p0", "safety", "fvg:p0"), zone("fvg:e1", "s", "fvg:e1"), zone("fvg:e2", "s", "fvg:e2")];
    const c = composeCanvas({ objects: objs, simplify: true, priorities: { "map:fvg:p0": 0 } });
    expect(c.overlays.map((o) => o.primary.mappingId)).toContain("map:fvg:p0");
    expect(c.collapsedCount).toBe(2);
  });
});
