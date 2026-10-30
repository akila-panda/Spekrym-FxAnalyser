import { describe, expect, it } from "vitest";
import { checkObjectsNoLookahead } from "@/desk/kernel/harness";
import { runKernel } from "@/desk/kernel/kernel";
import { mkObj } from "@/desk/__fixtures__/objects";
import { trend, range, zone } from "@/desk/__fixtures__/fixtures";
import { detectAll } from "./index";
import { buildRelations } from "./relations";
import { sampleDetector } from "./sampleDetector";

const ctx = { pair: "EUR_USD", tf: "H1", asOf: Infinity, dataKind: "sample", rulesVersion: "rtest" } as const;
const run = (bars: Parameters<typeof runKernel>[0]) =>
  sampleDetector.run(runKernel(bars, { pair: "EUR_USD", tf: "H1", asOf: Infinity }), ctx);

describe("sample detector", () => {
  it.each([trend, range, zone])("passes the no-lookahead harness on $name", (f) => {
    expect(checkObjectsNoLookahead(f.candles, "H1", run)).toEqual([]);
  });

  it("emits swings and a displacement impulse sharing origin_id", () => {
    expect(run(trend.candles).some((o) => o.type === "swing")).toBe(true);
    const imp = run(zone.candles).find((o) => o.type === "impulse");
    expect(imp?.origin_id).toMatch(/^disp:/);
  });

  it("ids exclude price (stable under recalculation)", () => {
    const a = run(trend.candles).filter((o) => o.type === "swing").map((o) => o.id);
    const shifted = trend.candles.map((c) => ({ ...c, open: c.open + 0.5, high: c.high + 0.5, low: c.low + 0.5, close: c.close + 0.5 }));
    expect(run(shifted).filter((o) => o.type === "swing").map((o) => o.id)).toEqual(a);
  });
});

describe("detectAll", () => {
  const base = { candles: trend.candles, pair: "EUR_USD", tf: "H1", asOf: Infinity, dataKind: "sample", dataVersion: "v1" } as const;
  it("memoises by key", () => {
    expect(detectAll(base)).toBe(detectAll(base));
    expect(detectAll({ ...base, dataVersion: "v2" })).not.toBe(detectAll(base));
  });
  it("carries sample provenance and ATR/price", () => {
    const r = detectAll(base);
    expect(r.objects.every((o) => o.provenance.dataKind === "sample")).toBe(true);
    expect(r.price).not.toBeNull();
    expect(r.atr).not.toBeNull();
  });
  it("as-of excludes later closes (prefix equality)", () => {
    const t = trend.candles[40]!.time + 3600;
    const early = detectAll({ ...base, asOf: t });
    expect(early.objects.every((o) => o.known_at <= t)).toBe(true);
  });
});

describe("relations", () => {
  it("overlap, contains, nested, shared_origin", () => {
    const big = mkObj({ source_tf: "D", lo: 1.1, hi: 1.12 });
    const small = mkObj({ source_tf: "H1", lo: 1.105, hi: 1.106 });
    const side = mkObj({ source_tf: "H1", lo: 1.119, hi: 1.13 });
    const sameTfInner = mkObj({ source_tf: "D", lo: 1.11, hi: 1.112 });
    const o1 = mkObj({ origin_id: "disp:x" });
    const o2 = mkObj({ origin_id: "disp:x", lo: 2, hi: 3 });
    const kinds = buildRelations([big, small, side, sameTfInner, o1, o2]).map((r) => r.kind);
    expect(kinds).toEqual(expect.arrayContaining(["nested", "overlap", "contains", "shared_origin"]));
  });
  it("skips swings and disjoint bands", () => {
    expect(buildRelations([mkObj({ type: "swing" }), mkObj({ type: "swing" })])).toEqual([]);
    expect(buildRelations([mkObj({ lo: 1, hi: 1.1 }), mkObj({ lo: 1.2, hi: 1.3 })])).toEqual([]);
  });
});