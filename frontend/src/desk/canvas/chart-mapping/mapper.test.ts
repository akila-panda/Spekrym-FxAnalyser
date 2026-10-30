import { describe, expect, it } from "vitest";
import { ChartMappingSchema } from "@/intel/contracts";
import { SAMPLE_ENGINE_OBJECTS, SAMPLE_INSIGHTS } from "@/intel/fixtures";
import { buildMappings, mapInsight, mapObject } from "./mapper";

const OBJ = SAMPLE_ENGINE_OBJECTS[0]!;          // known_at = 1_746_813_600
const INS = SAMPLE_INSIGHTS[0]!;                // availableAt = 1_746_813_600, objectIds -> OBJ.id

describe("F2 chart mapping — shape", () => {
  it("maps an object to a schema-valid ChartMapping referencing its geometry", () => {
    const m = mapObject(OBJ);
    expect(ChartMappingSchema.parse(m)).toEqual(m);
    expect(m.geometryRefs).toEqual([OBJ.id]);
    expect(m.overlayType).toBe("level"); // sr_level
    expect(m.visibility).toBe("visible");
  });

  it("maps an insight to its referenced objects (an insight is not geometry itself)", () => {
    const m = mapInsight(INS);
    expect(ChartMappingSchema.parse(m)).toEqual(m);
    expect(m.objectIds).toEqual(INS.objectIds);
    expect(m.geometryRefs).toEqual(INS.objectIds);
  });

  it("marks the focus target 'focused', others 'visible'", () => {
    expect(mapObject(OBJ, { focusId: OBJ.id }).visibility).toBe("focused");
    expect(mapObject(OBJ, { focusId: "other" }).visibility).toBe("visible");
  });
});

describe("F2 chart mapping — causality (never map the future)", () => {
  it("excludes an object whose known_at is after as-of", () => {
    expect(buildMappings({ objects: [OBJ], asOf: OBJ.known_at - 1 })).toEqual([]);
    expect(buildMappings({ objects: [OBJ], asOf: OBJ.known_at }).length).toBe(1);
  });

  it("excludes an insight whose availableAt is after as-of", () => {
    expect(buildMappings({ insights: [INS], asOf: INS.availableAt - 1 })).toEqual([]);
    expect(buildMappings({ insights: [INS], asOf: INS.availableAt }).length).toBe(1);
  });

  it("builds both objects and insights at latest, all schema-valid", () => {
    const ms = buildMappings({ objects: SAMPLE_ENGINE_OBJECTS, insights: SAMPLE_INSIGHTS });
    expect(ms.length).toBe(SAMPLE_ENGINE_OBJECTS.length + SAMPLE_INSIGHTS.length);
    for (const m of ms) expect(ChartMappingSchema.parse(m)).toEqual(m);
  });
});
