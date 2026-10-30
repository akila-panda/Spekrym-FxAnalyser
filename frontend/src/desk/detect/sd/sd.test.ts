import { describe, expect, it } from "vitest";
import { FIXTURES, zone } from "@/desk/__fixtures__/fixtures";
import { flatRows, fromRows, type Row } from "@/desk/__fixtures__/builders";
import { describeObject } from "@/desk/evidence/describe";
import { toAnnotations } from "@/desk/layers/adapter";
import { checkObjectsNoLookahead } from "@/desk/kernel/harness";
import { runKernel } from "@/desk/kernel/kernel";
import { lifecycleState, viewAsOf } from "@/desk/kernel/viewAsOf";
import { DEFAULTS } from "@/desk/methodology/defaults";
import { deepCandles } from "@/desk/mock/deepMock";
import { toIsoUtc } from "@/lib/time";
import { AnnotationSchema } from "@/types/schemas";
import { TF_SECONDS, type Candle, type Timeframe } from "@/types/market";
import { fvgDetector } from "../fvg/fvgDetector";
import { buildRelations } from "../relations";
import { zoneName } from "./names";
import { sdDetector } from "./sdDetector";

const SEC = TF_SECONDS.H1;
const ctxFor = (tf: Timeframe = "H1", cfg?: typeof DEFAULTS) =>
  ({ pair: "EUR_USD", tf, asOf: Infinity, dataKind: "sample", rulesVersion: "rtest", ...(cfg ? { cfg } : {}) }) as const;
const kern = (c: Candle[], tf: Timeframe = "H1") => runKernel(c, { pair: "EUR_USD", tf, asOf: Infinity });
const run = (c: Candle[], tf: Timeframe = "H1", cfg?: typeof DEFAULTS) => sdDetector.run(kern(c, tf), ctxFor(tf, cfg));
const withCfg = (sd: Record<string, unknown>) => ({ ...DEFAULTS, supplyDemand: { ...DEFAULTS.supplyDemand, ...sd } }) as unknown as typeof DEFAULTS;
const kinds = (o: { lifecycle: { kind: string }[] }) => o.lifecycle.map((e) => e.kind);
const mirror = (c: Candle[]) => c.map((x) => ({ ...x, open: 2.2 - x.open, high: 2.2 - x.low, low: 2.2 - x.high, close: 2.2 - x.close }));

// fixture: flats 0-19, base 20-22 (bodies 0.0003), bull departure bar 23 (+0.0021). Zero-body flats 17-19 also qualify as base (max 6 bars).
const tail: Row[] = [
  [1.1066, 1.1067, 1.1002, 1.101], // wick enters proximal edge (1.1003), stays above midpoint
  [1.101, 1.1011, 1.1001, 1.1005], // wick through midpoint
  [1.1005, 1.1006, 1.0996, 1.0998], // closes beyond distal edge (1.1)
];
const walk = [...zone.candles, ...fromRows("H1", tail, zone.candles.length)];
const T = (i: number, c: Candle[] = zone.candles): number => c[i]!.time;

describe("supply/demand detection", () => {
  const [o] = run(zone.candles);

  it("finds the fixture's demand zone: body bounds, frozen band, causal timing", () => {
    expect(run(zone.candles)).toHaveLength(1);
    expect(o!.type).toBe("sd_zone");
    expect(o!.layer).toBe("supplyDemand");
    expect(o!.direction).toBe("bull");
    expect(o!.geometry.bands[0]).toEqual({ pHigh: 1.1003, pLow: 1.1 });
    expect(o!.geometry.anchorTimes).toEqual([T(17), T(22)]);
    expect(o!.t_event).toBe(T(23));
    expect(o!.known_at).toBe(T(23) + SEC);
    expect(o!.lifecycle).toEqual([{ kind: "fresh", t: o!.known_at, known_at: o!.known_at }]);
    expect(o!.id).toBe(`sd_zone:EUR_USD:H1:${T(17)}-${T(22)}`);
    expect(zoneName(o!)).toBe("Demand zone");
  });

  it("validity checklist: base + departure support, location unavailable", () => {
    const f = Object.fromEntries(o!.grade!.factors.map((x) => [x.id, x]));
    expect(f.base!.status).toBe("supports");
    expect(f.base!.value).toBe(6);
    expect(f.departure!.value).toBeGreaterThanOrEqual(DEFAULTS.supplyDemand.sdDispAtr);
    expect(f.location!.status).toBe("unavailable");
    expect(f.order_block).toBeUndefined();
  });

  it("origin_id links the kernel displacement that covers the departure", () => {
    expect(o!.origin_id).toBe(`disp:EUR_USD:H1:${T(23)}`);
  });

  it("supply is the mirror image", () => {
    const [b] = run(mirror(zone.candles));
    expect(b!.direction).toBe("bear");
    expect(b!.geometry.bands[0]!.pHigh).toBeCloseTo(2.2 - 1.1, 6);
    expect(b!.geometry.bands[0]!.pLow).toBeCloseTo(2.2 - 1.1003, 6);
    expect(b!.known_at).toBe(o!.known_at);
    expect(zoneName(b!)).toBe("Supply zone");
  });

  it("bounds option: wick bounds widen the band; params are ATR-based", () => {
    const [w] = run(zone.candles, "H1", withCfg({ bounds: "wick" }));
    expect(w!.geometry.bands[0]).toEqual({ pHigh: 1.1004, pLow: 1.0998 });
    expect(run(zone.candles, "H1", withCfg({ sdDispAtr: 20 }))).toEqual([]);
    expect(run(zone.candles, "H1", withCfg({ baseAtr: 0.01 }))).toEqual([]);
    const [s] = run(zone.candles, "H1", withCfg({ baseBarsMax: 2 }));
    expect(s!.geometry.anchorTimes).toEqual([T(21), T(22)]);
  });

  it("ids exclude price; ATR warm-up stays quiet; copy never predicts", () => {
    const shifted = zone.candles.map((c) => ({ ...c, open: c.open + 1, high: c.high + 1, low: c.low + 1, close: c.close + 1 }));
    expect(run(shifted).map((x) => x.id)).toEqual(run(zone.candles).map((x) => x.id));
    expect(run(zone.candles.slice(0, 14))).toEqual([]);
    const text = [...o!.evidence.map((e) => e.note ?? ""), ...o!.grade!.factors.map((f) => f.label)].join(" ").toLowerCase();
    expect(text).not.toMatch(/reversal|will |likely|buy|sell|probab|forming/);
  });
});

describe("order blocks", () => {
  const dep: Row = [1.0998, 1.1025, 1.0997, 1.1024];
  const obOnlyRows: Row[] = [...flatRows(20, 1.1, 0.0004), [1.1003, 1.1004, 1.0996, 1.0998], dep, ...flatRows(5, 1.1024, 0.0004)];
  const merged: Row[] = [
    ...flatRows(20, 1.1, 0.0004),
    [1.1, 1.1004, 1.0999, 1.1003],
    [1.1003, 1.1004, 1.0999, 1.1], // small bearish candle = OB and last base bar
    [1.1, 1.1025, 1.0999, 1.1024],
    ...flatRows(5, 1.1024, 0.0004),
  ];

  it("a large opposite candle before the departure is an OB-only zone (no qualifying base)", () => {
    const os = run(fromRows("H1", obOnlyRows));
    expect(os).toHaveLength(1);
    const f = Object.fromEntries(os[0]!.grade!.factors.map((x) => [x.id, x]));
    expect(f.order_block!.status).toBe("supports");
    expect(f.base!.status).toBe("opposes");
    expect(os[0]!.geometry.bands[0]).toEqual({ pHigh: 1.1003, pLow: 1.0998 });
    expect(zoneName(os[0]!)).toBe("Bullish order block");
  });

  it("OB overlapping the base > 70% merges into one OB-tagged zone", () => {
    const os = run(fromRows("H1", merged));
    expect(os).toHaveLength(1);
    expect(os[0]!.grade!.factors.some((f) => f.id === "order_block")).toBe(true);
    expect(os[0]!.grade!.factors.find((f) => f.id === "base")!.status).toBe("supports");
    expect(os[0]!.geometry.bands[0]).toEqual({ pHigh: 1.1003, pLow: 1.1 });
    expect(zoneName(os[0]!)).toBe("Demand zone · OB");
  });

  it("OB candle is the departure's opposite colour only", () => {
    expect(run(zone.candles)[0]!.grade!.factors.some((f) => f.id === "order_block")).toBe(false);
  });
});

describe("zone lifecycle", () => {
  const z = (c: Candle[], cfg?: typeof DEFAULTS) => run(c, "H1", cfg)[0]!;

  it("fresh → partially_mitigated → fully_mitigated → invalidated, each known at its bar close", () => {
    const f = z(walk);
    expect(kinds(f)).toEqual(["fresh", "partially_mitigated", "fully_mitigated", "invalidated"]);
    expect(f.lifecycle[1]!.detail!.depth).toBeCloseTo(0.33, 2);
    f.lifecycle.slice(1).forEach((e, i) => expect(e.known_at).toBe(T(31 + i, walk) + SEC));
    expect(lifecycleState(f)).toBe("invalidated");
  });

  it("entering the zone and reaching the midpoint are not invalidation (wick ≠ close)", () => {
    expect(kinds(z(walk.slice(0, 33)))).toEqual(["fresh", "partially_mitigated", "fully_mitigated"]);
    expect(kinds(z(walk.slice(0, 32)))).toEqual(["fresh", "partially_mitigated"]);
  });

  it("supply mirrors the lifecycle", () => {
    expect(kinds(z(mirror(walk)))).toEqual(["fresh", "partially_mitigated", "fully_mitigated", "invalidated"]);
  });

  it("as-of folds the lifecycle and hides the zone before it was knowable", () => {
    const f = z(walk);
    expect(kinds(viewAsOf([f], T(32, walk) + SEC)[0]!)).toEqual(["fresh", "partially_mitigated", "fully_mitigated"]);
    expect(viewAsOf([f], f.known_at - 1)).toEqual([]);
  });
});

describe("no-lookahead harness: supply & demand", () => {
  const sets: [string, Candle[]][] = [
    ...FIXTURES.map((x) => [x.name, x.candles] as [string, Candle[]]),
    ["walk", walk],
    ["walk-bear", mirror(walk)],
    ["deep-H1", deepCandles("EUR_USD", "H1").slice(0, 1200) as Candle[]],
  ];
  for (const [name, bars] of sets) {
    it(`prefix-equal — ${name}`, () => {
      expect(checkObjectsNoLookahead(bars, "H1", (b) => run(b))).toEqual([]);
    });
  }
  it("prefix-equal — deep M15 (zones present)", () => {
    const bars = deepCandles("EUR_USD", "M15").slice(0, 1500) as Candle[];
    expect(checkObjectsNoLookahead(bars, "M15", (b) => run(b, "M15"), 30)).toEqual([]);
    expect(run(bars, "M15").length).toBeGreaterThan(0);
  });
});

describe("integration", () => {
  it("zone and FVG from the same departure share origin_id → shared_origin relation", () => {
    const rows: Row[] = [
      ...flatRows(20, 1.1, 0.0004),
      [1.1, 1.1004, 1.0999, 1.1003], [1.1, 1.1004, 1.0999, 1.1003], [1.1, 1.1004, 1.0999, 1.1003],
      [1.1003, 1.103, 1.1002, 1.1028], [1.1028, 1.1034, 1.101, 1.1032], ...flatRows(5, 1.1032, 0.0004),
    ];
    const k = kern(fromRows("H1", rows));
    const s = sdDetector.run(k, ctxFor())[0]!;
    const g = fvgDetector.run(k, ctxFor())[0]!;
    expect(s.origin_id).toBeDefined();
    expect(s.origin_id).toBe(g.origin_id);
    expect(buildRelations([s, g]).some((r) => r.kind === "shared_origin")).toBe(true);
  });

  it("describe + adapter: neutral copy, valid zone annotation; OB uses the order_block role", () => {
    const [o] = run(zone.candles);
    const d = describeObject(o!, "evidence", { viewTf: "H1" });
    expect(d.headline).toMatch(/^H1 Demand zone · 1\.10000–1\.10030/);
    expect(d.quality.join(" ")).toContain("Unavailable input");
    const [a] = toAnnotations([o!], { viewTf: "H1", until: o!.known_at + SEC, projected: new Set() });
    expect(a!.kind).toBe("zone");
    expect(a!.role).toBe("premium_discount");
    const wire = JSON.parse(JSON.stringify(a, (k, v) => (typeof v === "number" && ["t0", "t1", "known_at"].includes(k) ? toIsoUtc(v) : v)));
    expect(AnnotationSchema.safeParse(wire).success).toBe(true);
    const ob = { ...o!, grade: { ...o!.grade!, factors: [...o!.grade!.factors, { id: "order_block", label: "OB", status: "supports" as const }] } };
    expect(toAnnotations([ob], { viewTf: "H1", until: o!.known_at + SEC, projected: new Set() })[0]!.role).toBe("order_block");
  });

  it("5,000 bars stay inside the detection budget", () => {
    for (const tf of ["M15", "M1"] as const) {
      const bars = deepCandles("EUR_USD", tf).slice(0, 5000) as Candle[];
      const k = kern(bars, tf);
      const t0 = performance.now();
      const n = sdDetector.run(k, ctxFor(tf)).length;
      const ms = performance.now() - t0;
      console.log(`S/D detector: ${n} zones, 5000 ${tf} bars, ${ms.toFixed(1)} ms`);
      expect(ms).toBeLessThan(150);
    }
  });
});