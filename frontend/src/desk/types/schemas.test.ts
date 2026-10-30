import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  AnalysisObjectSchema, DecisionSchema, RelationSchema, SnapshotSchema, sourced,
} from "./schemas";

const obj = {
  id: "sr_level:EUR_USD:H1:1700000000",
  type: "sr_level", layer: "levels", pair: "EUR_USD", source_tf: "H1",
  geometry: { bands: [{ pHigh: 1.1, pLow: 1.09 }], anchorTimes: [1_700_000_000] },
  t_event: 1_700_000_000, known_at: 1_700_003_600,
  provenance: { rulesVersion: "rabc", dataKind: "sample", detector: "levels", detectorVersion: 1 },
};

describe("DK0 schemas", () => {
  it("round-trips a valid AnalysisObject and fills defaults", () => {
    const a = AnalysisObjectSchema.parse(obj);
    expect(a.confirmed_at).toBeNull();
    expect(a.lifecycle).toEqual([]);
    expect(a.evidence).toEqual([]);
  });

  it("rejects an unknown object type and a bad pair", () => {
    expect(() => AnalysisObjectSchema.parse({ ...obj, type: "nope" })).toThrow();
    expect(() => AnalysisObjectSchema.parse({ ...obj, pair: "XXX_YYY" })).toThrow();
  });

  it("requires at least one anchor time", () => {
    expect(() => AnalysisObjectSchema.parse({ ...obj, geometry: { bands: [], anchorTimes: [] } })).toThrow();
  });

  it("validates relation, decision and snapshot", () => {
    expect(RelationSchema.parse({ id: "relation:overlap:a:b", kind: "overlap", aId: "a", bId: "b", known_at: 1 }).kind).toBe("overlap");
    expect(DecisionSchema.parse({ id: "d1", pair: "EUR_USD", date: "2026-03-02", objectId: "o", action: "accept", decided_at: 1, rulesVersion: "r1" }).action).toBe("accept");
    expect(() => DecisionSchema.parse({ id: "d1", pair: "EUR_USD", date: "03-02-2026", objectId: "o", action: "accept", decided_at: 1, rulesVersion: "r1" })).toThrow();
    const snap = SnapshotSchema.parse({ id: "s", pair: "EUR_USD", date: "2026-03-02", as_of: 1, dataKind: "sample", rulesVersion: "r1", created_at: 2 });
    expect(snap.objects).toEqual([]);
  });

  it("sourced() wraps a payload with provenance", () => {
    const S = sourced(z.object({ x: z.number() }));
    const v = S.parse({ data: { x: 1 }, provenance: { kind: "sample", asOf: 10, fetchedAt: 11 } });
    expect(v.provenance.kind).toBe("sample");
    expect(() => S.parse({ data: { x: 1 }, provenance: { kind: "other", asOf: 10, fetchedAt: 11 } })).toThrow();
  });
});
