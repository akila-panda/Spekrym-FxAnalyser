import { describe, expect, it } from "vitest";
import type { AnalysisObject, Geometry, ObjectType } from "@/desk/types/schemas";
import {
  PRIMITIVE_KINDS, objectToPrimitive, primitivesFor, scenarioPath,
  sessionShade, regimeInterval, riskWindow, conflictMarker, uncertaintyEnvelope, type VisualPrimitive,
} from "./primitives";

const geo = (bands: { pHigh: number; pLow: number }[], anchorTimes: number[], points?: { t: number; p: number }[]): Geometry =>
  ({ bands, anchorTimes, ...(points ? { points } : {}) });

const mk = (type: ObjectType, geometry: Geometry, known_at = 1_746_813_600): AnalysisObject => ({
  id: `${type}:x`, type, layer: "levels", pair: "EUR_USD", source_tf: "H1", geometry,
  t_event: 1_746_810_000, known_at, confirmed_at: null, lifecycle: [],
  provenance: { rulesVersion: "s", dataKind: "sample", detector: type, detectorVersion: 0 }, evidence: [],
});

describe("F4 object → primitive", () => {
  it("sr_level → level at the band midpoint, extended to the view edge", () => {
    const p = objectToPrimitive(mk("sr_level", geo([{ pHigh: 1.1025, pLow: 1.1019 }], [1_746_810_000])), { to: 1_746_828_000 });
    expect(p.kind).toBe("level");
    if (p.kind === "level") { expect(p.price).toBeCloseTo(1.1022, 6); expect(p.to).toBe(1_746_828_000); }
  });
  it("fvg / sd_zone → zone with the band bounds", () => {
    for (const t of ["fvg", "sd_zone"] as const) {
      const p = objectToPrimitive(mk(t, geo([{ pHigh: 1.104, pLow: 1.103 }], [1_746_810_000])));
      expect(p.kind).toBe("zone");
      if (p.kind === "zone") { expect(p.pHigh).toBe(1.104); expect(p.pLow).toBe(1.103); }
    }
  });
  it("sweep → event marker", () => {
    expect(objectToPrimitive(mk("sweep", geo([{ pHigh: 1.105, pLow: 1.105 }], [1_746_817_200]))).kind).toBe("event_marker");
  });
  it("trendline → line from its points", () => {
    const p = objectToPrimitive(mk("trendline", geo([], [1_746_810_000, 1_746_820_000], [{ t: 1_746_810_000, p: 1.10 }, { t: 1_746_820_000, p: 1.11 }])));
    expect(p.kind).toBe("line");
    if (p.kind === "line") expect(p.points).toHaveLength(2);
  });
  it("swing → marker", () => {
    expect(objectToPrimitive(mk("swing", geo([], [1_746_810_000], [{ t: 1_746_810_000, p: 1.10 }]))).kind).toBe("marker");
  });
});

describe("F4 causal placement", () => {
  it("excludes objects whose known_at is after as-of; never draws the future path", () => {
    const o = mk("sr_level", geo([{ pHigh: 1.1025, pLow: 1.1019 }], [1_746_810_000]));
    expect(primitivesFor([o], { asOf: o.known_at - 1 })).toEqual([]);
    expect(primitivesFor([o], { asOf: o.known_at })).toHaveLength(1);
    // a scenario branch is drawn forward only
    expect(scenarioPath([{ t: 100, p: 1 }], 200)).toBeNull();
    expect(scenarioPath([{ t: 100, p: 1 }, { t: 300, p: 2 }], 200)?.kind).toBe("path");
  });
});

describe("F4 all intelligence-type primitives are producible", () => {
  it("covers every primitive kind", () => {
    const made: VisualPrimitive[] = [
      objectToPrimitive(mk("sr_level", geo([{ pHigh: 1, pLow: 1 }], [1]))),
      objectToPrimitive(mk("fvg", geo([{ pHigh: 2, pLow: 1 }], [1]))),
      objectToPrimitive(mk("trendline", geo([], [1, 2], [{ t: 1, p: 1 }, { t: 2, p: 2 }]))),
      objectToPrimitive(mk("swing", geo([], [1], [{ t: 1, p: 1 }]))),
      objectToPrimitive(mk("sweep", geo([{ pHigh: 1, pLow: 1 }], [1]))),
      sessionShade(1, 2, "London"), regimeInterval(1, 2, "expansion"), riskWindow(1, 2, "CPI"),
      scenarioPath([{ t: 1, p: 1 }, { t: 2, p: 2 }], 0, "bull")!,
      uncertaintyEnvelope([{ t: 1, pLow: 1, pHigh: 2 }]), conflictMarker(1, 1.1, "struct vs regime"),
    ];
    const kinds = new Set(made.map((p) => p.kind));
    for (const k of PRIMITIVE_KINDS) expect(kinds.has(k)).toBe(true);
  });
});
