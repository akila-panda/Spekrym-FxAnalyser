import { beforeEach, describe, expect, it } from "vitest";
import { objectId, relationId } from "./ids";
import { canonicalHash, rulesVersion } from "./hash";
import { createLocalStore, deskKey } from "./storage";

describe("ids", () => {
  it("id is stable and excludes price", () => {
    const a = objectId({ type: "sr_level", pair: "EUR_USD", tf: "H1", anchorTimes: [1700000000] });
    expect(a).toBe("sr_level:EUR_USD:H1:1700000000");
    expect(objectId({ type: "sr_level", pair: "EUR_USD", tf: "H1", anchorTimes: [1700000000] })).toBe(a);
  });
  it("relationId is order-independent", () => {
    expect(relationId("overlap", "b", "a")).toBe(relationId("overlap", "a", "b"));
  });
});

describe("hash", () => {
  it("canonicalHash ignores key order", () => {
    expect(canonicalHash({ a: 1, b: 2 })).toBe(canonicalHash({ b: 2, a: 1 }));
  });
  it("rulesVersion changes when a param changes", () => {
    expect(rulesVersion({ n: 3 })).not.toBe(rulesVersion({ n: 5 }));
    expect(rulesVersion({ n: 3 })).toBe(rulesVersion({ n: 3 }));
  });
});

describe("storage", () => {
  beforeEach(() => localStorage.clear());
  const make = (over = {}) =>
    createLocalStore<number[]>({ name: "t", version: 1, parse: (r) => (Array.isArray(r) ? (r as number[]) : []), empty: () => [], ...over });

  it("keys as spekrym.desk.<name>.v<version>", () => {
    expect(deskKey("decisions", 1)).toBe("spekrym.desk.decisions.v1");
  });
  it("round-trips and drops corrupt input", () => {
    const s = make();
    expect(s.save([1, 2, 3])).toBe(true);
    expect(s.load()).toEqual([1, 2, 3]);
    localStorage.setItem(s.key, "{not json");
    expect(s.load()).toEqual([]);
  });
  it("returns empty on a version mismatch (default migrate discards)", () => {
    localStorage.setItem(deskKey("t", 1), JSON.stringify({ version: 0, data: [9] }));
    expect(make().load()).toEqual([]);
  });
  it("refuses an over-quota save and reports", () => {
    let flagged = -2;
    const s = make({ maxBytes: 10, onQuota: (b: number) => { flagged = b; } });
    expect(s.save([1, 2, 3, 4, 5, 6, 7, 8, 9])).toBe(false);
    expect(flagged).toBeGreaterThan(10);
  });
});
