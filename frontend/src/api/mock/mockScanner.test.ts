import { describe, expect, it } from "vitest";
import type { ScanRequest } from "@/types";
import { parseScanResult, ScanResultSchema } from "@/types";
import { ApiError } from "../client";
import { getDataset } from "./generateCandles";
import { buildMockScanWire, runMockScan } from "./mockScanner";

const ds = getDataset("EUR_USD");
const FIRST = ds.M1[0]?.time ?? 0;
const LAST = (ds.M1[ds.M1.length - 1]?.time ?? 0) + 60;

const req = (over: Partial<ScanRequest> = {}): ScanRequest => ({
  strategy_id: "orb", pair: "EUR_USD", timeframe: "M1", from: "2025-04-07", to: "2025-05-09", params: {}, ...over,
});

const CASES: ScanRequest[] = [
  req(), req({ timeframe: "M5" }), req({ timeframe: "M15" }),
  req({ params: { use_vwap: false } }),
  req({ strategy_id: "silver_bullet", params: { window: "all" } }),
  req({ strategy_id: "silver_bullet", timeframe: "M5", params: { window: "all", require_sweep: false } }),
  req({ strategy_id: "silver_bullet", pair: "USD_JPY", params: { window: "all" } }),
];

function times(a: Record<string, unknown>): number[] {
  const out: number[] = [];
  for (const k of ["t0", "t1", "known_at", "exit_time"]) if (typeof a[k] === "number") out.push(a[k]);
  for (const pt of (a.points as { t: number }[] | undefined) ?? []) out.push(pt.t);
  return out;
}

describe("mockScanner", () => {
  it("produces valid and rejected setups for ORB and Silver Bullet", () => {
    for (const r of [req(), req({ strategy_id: "silver_bullet", params: { window: "all" } })]) {
      const res = runMockScan(r, getDataset(r.pair));
      expect(res.summary.n_valid).toBeGreaterThan(0);
      expect(res.summary.n_rejected).toBeGreaterThan(0);
      expect(res.setups.some((s) => s.conditions.some((c) => c.passed === false))).toBe(true);
      expect(res.warnings.join(" ")).toMatch(/not validated/);
    }
  });

  it.each(CASES.map((c, i) => [i, c] as const))("case %i passes the schema, with sane times, steps and ids", (_i, r) => {
    const ds2 = getDataset(r.pair);
    const wire = buildMockScanWire(r, ds2);
    expect(ScanResultSchema.safeParse(wire).success).toBe(true);
    const res = parseScanResult(wire);
    const allIds = new Set<string>();
    for (const s of res.setups) {
      const stepNs = new Set(s.steps.map((x) => x.n));
      for (const a of s.annotations) {
        expect(a.step === 0 || stepNs.has(a.step)).toBe(true);
        expect(allIds.has(a.id)).toBe(false);
        allIds.add(a.id);
        for (const t of times(a as unknown as Record<string, unknown>)) {
          expect(t).toBeGreaterThanOrEqual(FIRST);
          expect(t).toBeLessThanOrEqual(LAST);
        }
        if (a.kind === "trade") {
          expect(a.exit_time ?? a.t1).toBeGreaterThan(a.t0);
          expect(a.t1).toBeGreaterThan(a.t0);
        }
      }
      expect(s.focus.to).toBeGreaterThan(s.focus.from);
      if (s.status === "valid") expect(s.annotations.some((a) => a.kind === "trade")).toBe(true);
      expect(s.steps.map((x) => x.n)).toEqual(s.steps.map((_, i) => i + 1));
    }
  });

  it("emits context at H1 and H4 plus scan-timeframe annotations", () => {
    const res = runMockScan(req(), ds);
    const srcs = new Set(res.setups.flatMap((s) => s.annotations.map((a) => a.source_tf)));
    expect(srcs).toEqual(new Set(["M1", "H1", "H4"]));
  });

  it("is deterministic and respects the date range", () => {
    const a = runMockScan(req({ from: "2025-04-14", to: "2025-04-18" }), ds);
    expect(runMockScan(req({ from: "2025-04-14", to: "2025-04-18" }), ds)).toEqual(a);
    expect(a.setups.length).toBeGreaterThan(0);
    for (const s of a.setups) expect(s.date >= "2025-04-14" && s.date <= "2025-04-18").toBe(true);
  });

  it("summary matches the valid setups", () => {
    const res = runMockScan(req(), ds);
    const rs = res.setups.flatMap((s) => (s.outcome ? [s.outcome.r_multiple] : []));
    expect(res.summary.n_valid).toBe(rs.length);
    expect(res.summary.expectancy_r).toBeCloseTo(rs.reduce((x, y) => x + y, 0) / rs.length, 1);
    expect(res.summary.cost_pips_assumed).toBe(1.6);
  });

  it("rejects bad requests like the real API", () => {
    const status = (fn: () => unknown) => {
      try { fn(); } catch (e) { return e instanceof ApiError ? e.status : -1; }
      return 0;
    };
    expect(status(() => buildMockScanWire(req({ strategy_id: "nope" }), ds))).toBe(404);
    expect(status(() => buildMockScanWire(req({ timeframe: "H1" }), ds))).toBe(422);
    expect(status(() => buildMockScanWire(req({ params: { bogus: 1 } }), ds))).toBe(422);
    expect(status(() => buildMockScanWire(req({ params: { range_min: 1 } }), ds))).toBe(422);
    expect(status(() => buildMockScanWire(req({ from: "2025-05-02", to: "2025-05-01" }), ds))).toBe(422);
  });
});