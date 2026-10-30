import { describe, expect, it } from "vitest";
import { FIXTURES, fvg } from "@/desk/__fixtures__/fixtures";
import { flatRows, fromRows, zigzagRows, type Row } from "@/desk/__fixtures__/builders";
import { mkObj } from "@/desk/__fixtures__/objects";
import { describeObject } from "@/desk/evidence/describe";
import { toAnnotations } from "@/desk/layers/adapter";
import { checkObjectsNoLookahead } from "@/desk/kernel/harness";
import { runKernel } from "@/desk/kernel/kernel";
import { lifecycleState, viewAsOf } from "@/desk/kernel/viewAsOf";
import { DEFAULTS } from "@/desk/methodology/defaults";
import { deepCandles } from "@/desk/mock/deepMock";
import { toIsoUtc } from "@/lib/time";
import { AnnotationSchema } from "@/types/schemas";
import { T0 } from "@/desk/__fixtures__/builders";
import { TF_SECONDS, type Candle, type Timeframe } from "@/types/market";
import { detectAll } from "../registry";
import "../index";
import { fvgDetector } from "../fvg/fvgDetector";
import { liquidityDetector } from "../liquidity/liquidityDetector";
import { sdDetector } from "../sd/sdDetector";
import { srDetector } from "../levels/srDetector";
import { paName } from "./names";
import { paDetector } from "./paDetector";
import { marketClass } from "./range";
import { confirmedRange, rangeFraction } from "./premium";
import { bestTrendlines } from "./trendlines";

const SEC = TF_SECONDS.H1;
const ctxFor = (tf: Timeframe = "H1", cfg?: typeof DEFAULTS) =>
  ({ pair: "EUR_USD", tf, asOf: Infinity, dataKind: "sample", rulesVersion: "rtest", ...(cfg ? { cfg } : {}) }) as const;
const kern = (c: Candle[], tf: Timeframe = "H1") => runKernel(c, { pair: "EUR_USD", tf, asOf: Infinity });
const run = (c: Candle[], tf: Timeframe = "H1", cfg?: typeof DEFAULTS, prior: Parameters<typeof paDetector.run>[2] = []) =>
  paDetector.run(kern(c, tf), ctxFor(tf, cfg), prior);
const withPa = (pa: Record<string, unknown>) => ({ ...DEFAULTS, priceAction: { ...DEFAULTS.priceAction, ...pa } }) as unknown as typeof DEFAULTS;
const kinds = (o: { lifecycle: { kind: string }[] }) => o.lifecycle.map((e) => e.kind);
const of = (os: ReturnType<typeof run>, type: string) => os.filter((o) => o.type === type);
const mirror = (c: Candle[]) => c.map((x) => ({ ...x, open: 2.2 - x.open, high: 2.2 - x.low, low: 2.2 - x.high, close: 2.2 - x.close }));
const shift = (rows: Row[], d: number): Row[] => rows.map(([o, h, l, c]) => [o + d, h + d, l + d, c + d]);
const T = (i: number, c: Candle[]): number => c[i]!.time;

// 30-bar legs → swing-scale (N=9) swings. Range: highs at 29/89/149, lows at 59/119/179 (1.1102 / 1.0998).
const rangeBase = fromRows("H1", zigzagRows([1.1, 1.11, 1.1, 1.11, 1.1, 1.11, 1.1, 1.11], 30));
const upBreak: Row[] = [[1.11, 1.1135, 1.1099, 1.113], [1.113, 1.1131, 1.11, 1.112]];
const failed: Row[] = [[1.11, 1.1135, 1.1099, 1.113], [1.113, 1.1131, 1.109, 1.1095]];
const withRows = (base: Candle[], rows: Row[]) => [...base, ...fromRows("H1", rows, base.length)];
// Rising lows 1.1038 / 1.1078 / 1.1118 on one line (idx 59/119/179).
const tlBase = fromRows("H1", zigzagRows([1.1, 1.14, 1.104, 1.144, 1.108, 1.148, 1.112, 1.152], 30));

describe("ranges", () => {
  const os = of(run(rangeBase), "range");

  it("finds 2 equal swing highs + 2 equal swing lows; band frozen; extra touches absorbed", () => {
    expect(os).toHaveLength(1);
    const r = os[0]!;
    expect(r.layer).toBe("priceAction");
    expect(r.geometry.bands[0]!.pHigh).toBeCloseTo(1.1102, 6);
    expect(r.geometry.bands[0]!.pLow).toBeCloseTo(1.0998, 6);
    expect(r.geometry.anchorTimes).toEqual([29, 59, 89, 119].map((i) => T(i, rangeBase)));
    expect(r.known_at).toBe(T(128, rangeBase) + SEC);
    expect(r.lifecycle).toEqual([{ kind: "active", t: r.known_at, known_at: r.known_at }]);
  });

  it("breakout, then retest within failBars", () => {
    const r = of(run(withRows(rangeBase, upBreak)), "range")[0]!;
    expect(kinds(r)).toEqual(["active", "broken", "retested"]);
    expect(r.lifecycle[1]!.detail).toMatchObject({ dir: "up" });
    expect(r.lifecycle[1]!.known_at).toBe(T(210, withRows(rangeBase, upBreak)) + SEC);
    expect(lifecycleState(r)).toBe("retested");
  });

  it("close back inside after the breakout is a failed_breakout (separate fact)", () => {
    expect(kinds(of(run(withRows(rangeBase, failed)), "range")[0]!)).toEqual(["active", "broken", "failed_breakout"]);
  });

  it("downside breakout mirrors", () => {
    const m = mirror(withRows(rangeBase, upBreak));
    expect(of(run(m), "range")[0]!.lifecycle[1]!.detail).toMatchObject({ dir: "down" });
  });

  it("a steady trend has no range; edges are ATR-based", () => {
    expect(of(run(tlBase), "range")).toEqual([]);
    expect(of(run(rangeBase, "H1", withPa({ rangeMinAtr: 500 })), "range")).toEqual([]);
  });

  it("trend/range class: intact range wins; HH/HL is trend up; mirrored is trend down", () => {
    expect(marketClass(kern(rangeBase), DEFAULTS)).toBe("range");
    const up = fromRows("H1", zigzagRows([1.1, 1.11, 1.105, 1.115, 1.11, 1.12, 1.115, 1.125], 30));
    expect(marketClass(kern(up), DEFAULTS)).toBe("trend_up");
    expect(marketClass(kern(mirror(up)), DEFAULTS)).toBe("trend_down");
    expect(marketClass(kern(up.slice(0, 20)), DEFAULTS)).toBe("transitioning");
  });
});

describe("trendlines", () => {
  const os = of(run(tlBase), "trendline");

  it("rising support line through three swing lows; frozen; known at the 3rd touch's confirmation", () => {
    expect(os).toHaveLength(1);
    const t = os[0]!;
    expect(t.direction).toBe("bull");
    expect(t.geometry.anchorTimes).toEqual([59, 119, 179].map((i) => T(i, tlBase)));
    expect(t.known_at).toBe(T(188, tlBase) + SEC);
    expect(t.geometry.points!.length).toBe(2);
    expect(t.lifecycle).toEqual([{ kind: "active", t: t.known_at, known_at: t.known_at }]);
    expect(paName(t)).toBe("Rising support line");
    expect(t.grade!.factors.find((f) => f.id === "touches")!.value).toBe(3);
  });

  it("falling resistance is the mirror image", () => {
    const [b] = of(run(mirror(tlBase)), "trendline");
    expect(b!.direction).toBe("bear");
    expect(b!.known_at).toBe(os[0]!.known_at);
    expect(paName(b!)).toBe("Falling resistance line");
  });

  it("a close beyond the line breaks it (known at that bar's close)", () => {
    const rows: Row[] = [[1.152, 1.152, 1.1, 1.1]];
    const c = withRows(tlBase, rows);
    const t = of(run(c), "trendline")[0]!;
    expect(kinds(t)).toEqual(["active", "broken"]);
    expect(t.lifecycle[1]!.known_at).toBe(T(210, c) + SEC);
  });

  it("needs tlMinTouches; a 4-touch requirement finds nothing here", () => {
    expect(of(run(tlBase, "H1", withPa({ tlMinTouches: 4 })), "trendline")).toEqual([]);
  });

  it("bestTrendlines keeps the best N active lines per TF and side", () => {
    const mk = (sig: number, dir: "bull" | "bear", life: string[] = ["active"]) =>
      mkObj({ type: "trendline", layer: "priceAction", direction: dir, grade: { significance: sig, relevance: null, quality: null, freshness: null, factors: [] }, lifecycle: life.map((kind) => ({ kind, t: 1, known_at: 1 })) });
    const a = mk(0.9, "bull"), b = mk(0.5, "bull"), c = mk(0.7, "bull"), d = mk(0.99, "bull", ["active", "broken"]), e = mk(0.1, "bear");
    const out = bestTrendlines([a, b, c, d, e], 2).map((x) => x.id);
    expect(out).toEqual(expect.arrayContaining([a.id, c.id, e.id]));
    expect(out).not.toContain(b.id);
    expect(out).not.toContain(d.id);
  });
});

describe("impulses and corrections", () => {
  const flats = fromRows("H1", flatRows(5, 1.1032, 0.0004), fvg.candles.length);
  const tail: Row[] = [[1.1032, 1.1033, 1.0995, 1.1]]; // closes beyond the impulse origin
  const bars = [...fvg.candles, ...flats, ...fromRows("H1", tail, fvg.candles.length + 5)];

  it("impulse: kernel displacement with correction then invalidation, each known at its bar close", () => {
    const [i] = of(run(bars), "impulse");
    expect(i!.id).toBe(`impulse:EUR_USD:H1:${T(20, bars)}-${T(20, bars)}`);
    expect(i!.origin_id).toBe(`disp:EUR_USD:H1:${T(20, bars)}`);
    expect(i!.geometry.bands[0]).toEqual({ pHigh: 1.103, pLow: 1.1001 });
    expect(kinds(i!)).toEqual(["impulse", "correction", "invalidated"]);
    expect(i!.lifecycle[1]!.known_at).toBe(T(21, bars) + SEC);
    expect(i!.lifecycle[2]!.known_at).toBe(T(32, bars) + SEC);
    expect(kinds(of(run(bars, "H1", withPa({ corrAtr: 500 })), "impulse")[0]!)).toEqual(["impulse", "invalidated"]);
  });

  it("wins the id de-dupe over the sample detector's impulse", () => {
    const r = detectAll({ candles: bars, pair: "EUR_USD", tf: "H1", asOf: Infinity, dataKind: "sample", dataVersion: "imp" });
    const imp = r.objects.filter((o) => o.type === "impulse");
    expect(imp.length).toBeGreaterThan(0);
    expect(new Set(imp.map((o) => o.id)).size).toBe(imp.length);
    expect(imp.every((o) => o.provenance.detector === "priceAction")).toBe(true);
  });
});

describe("candle signals only within location", () => {
  const rows = (): Row[] => [
    ...flatRows(20, 1.1, 0.0004),
    [1.1006, 1.1007, 1.1, 1.1001],
    [1.1, 1.1012, 1.0996, 1.101], // bullish engulfing, tip 1.0996
  ];
  const bars = fromRows("H1", rows());
  const zone = (over: Record<string, unknown> = {}) =>
    mkObj({ type: "sd_zone", layer: "supplyDemand", direction: "bull", lo: 1.099, hi: 1.0998, known_at: T0, lifecycle: [{ kind: "fresh", t: T0, known_at: T0 }], ...over });

  it("engulfing inside a known zone's reach becomes a signal with a location factor", () => {
    const z = zone();
    const [s] = of(run(bars, "H1", undefined, [z]), "candle_signal");
    expect(s!.direction).toBe("bull");
    expect(s!.known_at).toBe(T(21, bars) + SEC);
    expect(s!.grade!.factors.find((f) => f.id === "pattern")!.label).toBe("Bullish engulfing");
    expect(s!.grade!.factors.find((f) => f.id === "location")!.label).toContain("Demand zone");
    expect(s!.evidence[0]!.objectId).toBe(z.id);
    expect(paName(s!)).toBe("Bullish engulfing");
  });

  it("no location, far location, spent or not-yet-known anchors ⇒ no signal", () => {
    expect(of(run(bars), "candle_signal")).toEqual([]);
    expect(of(run(bars, "H1", undefined, [zone({ lo: 1.09, hi: 1.091 })]), "candle_signal")).toEqual([]);
    expect(of(run(bars, "H1", undefined, [zone({ lifecycle: [{ kind: "fresh", t: T0, known_at: T0 }, { kind: "invalidated", t: T0 + 1, known_at: T0 + 1 }] })]), "candle_signal")).toEqual([]);
    expect(of(run(bars, "H1", undefined, [zone({ known_at: T(21, bars) + SEC + 1 })]), "candle_signal")).toEqual([]);
  });

  it("pin bar (long lower wick) and the bearish mirror", () => {
    const pin = fromRows("H1", [...flatRows(20, 1.1, 0.0004), [1.1003, 1.1004, 1.099, 1.1002]]);
    const [p] = of(run(pin, "H1", undefined, [zone({ lo: 1.0985, hi: 1.0995 })]), "candle_signal");
    expect(p!.grade!.factors.find((f) => f.id === "pattern")!.label).toBe("Bullish pin bar");
    const [m] = of(run(mirror(pin), "H1", undefined, [zone({ lo: 2.2 - 1.0995, hi: 2.2 - 1.0985, direction: "bear" })]), "candle_signal");
    expect(m!.direction).toBe("bear");
    expect(m!.grade!.factors.find((f) => f.id === "pattern")!.label).toBe("Bearish pin bar");
  });

  it("min bar range and neutral copy", () => {
    expect(of(run(bars, "H1", withPa({ signalMinRangeAtr: 50 }), [zone()]), "candle_signal")).toEqual([]);
    const [s] = of(run(bars, "H1", undefined, [zone()]), "candle_signal");
    const text = [...s!.evidence.map((e) => e.note ?? ""), ...s!.grade!.factors.map((f) => f.label)].join(" ").toLowerCase();
    expect(text).not.toMatch(/reversal|will |likely|buy|sell|probab|forming/);
  });
});

describe("premium/discount feeds S/D location", () => {
  const zoneRows: Row[] = [
    [1.1, 1.1004, 1.0999, 1.1003], [1.1, 1.1004, 1.0999, 1.1003], [1.1, 1.1004, 1.0999, 1.1003],
    [1.1003, 1.1025, 1.1002, 1.1024], ...flatRows(5, 1.1024, 0.0004),
  ];
  // dealing range 1.0998–1.1402 confirmed (swing high idx 29, swing low idx 59); then a demand zone at the range low
  const disc = fromRows("H1", [...zigzagRows([1.1, 1.14, 1.1], 30), ...flatRows(40, 1.1, 0.0004), ...zoneRows]);
  // same zone shape at the range high (premium)
  const prem = fromRows("H1", [...zigzagRows([1.14, 1.1, 1.14], 30), ...flatRows(40, 1.14, 0.0004), ...shift(zoneRows, 0.04)]);
  const loc = (c: Candle[]) => sdDetector.run(kern(c), ctxFor()).at(-1)!.grade!.factors.find((f) => f.id === "location")!;

  it("confirmedRange is causal and rangeFraction places a price in it", () => {
    const k = kern(disc);
    expect(confirmedRange(k, T(60, disc) + SEC)).toBeNull(); // swing low not yet confirmed
    const r = confirmedRange(k, T(100, disc))!;
    expect(r.hi.price).toBeCloseTo(1.1402, 6);
    expect(r.lo.price).toBeCloseTo(1.0998, 6);
    expect(r.eq).toBeCloseTo(1.12, 6);
    expect(rangeFraction(r, 1.12)).toBeCloseTo(0.5, 6);
  });

  it("demand in discount supports; demand in premium opposes; supply mirrors", () => {
    expect(loc(disc)).toMatchObject({ status: "supports" });
    expect(loc(disc).label).toMatch(/^Discount of the current range/);
    expect(loc(prem)).toMatchObject({ status: "opposes" });
    expect(loc(prem).label).toMatch(/^Premium of the current range/);
    expect(loc(mirror(disc))).toMatchObject({ status: "supports" }); // supply at the range high
    expect(loc(mirror(prem))).toMatchObject({ status: "opposes" }); // supply at the range low
  });

  it("no confirmed range ⇒ location stays unavailable (honest)", () => {
    const f = loc(fromRows("H1", [...flatRows(20, 1.1, 0.0004), ...zoneRows]));
    expect(f.status).toBe("unavailable");
  });
});

describe("no-lookahead harness: price action", () => {
  const sets: [string, Candle[]][] = [
    ...FIXTURES.map((x) => [x.name, x.candles] as [string, Candle[]]),
    ["range+break", withRows(rangeBase, upBreak)],
    ["range+failed", withRows(rangeBase, failed)],
    ["trendline", withRows(tlBase, [[1.152, 1.152, 1.1, 1.1]])],
    ["trendline-bear", mirror(tlBase)],
    ["deep-H1", deepCandles("EUR_USD", "H1").slice(0, 1500) as Candle[]],
  ];
  for (const [name, bars] of sets) {
    it(`prefix-equal — ${name}`, () => {
      expect(checkObjectsNoLookahead(bars, "H1", (b) => run(b))).toEqual([]);
    });
  }
  it("prefix-equal — deep M15 with candle signals (prior from the other detectors)", () => {
    const bars = deepCandles("EUR_USD", "M15").slice(0, 1200) as Candle[];
    const detect = (b: Candle[]) => {
      const k = kern(b, "M15");
      const c = ctxFor("M15");
      const prior = [...srDetector.run(k, c), ...fvgDetector.run(k, c), ...liquidityDetector.run(k, c), ...sdDetector.run(k, c)];
      return paDetector.run(k, c, prior);
    };
    expect(checkObjectsNoLookahead(bars, "M15", detect, 24)).toEqual([]);
    const types = new Set(detect(bars).map((o) => o.type));
    console.log("deep M15 price-action types:", [...types].join(","));
    expect(types.has("impulse")).toBe(true);
  });
});

describe("integration", () => {
  it("adapter: range → zone, trendline → line, signal → marker; as-of hides unknown objects", () => {
    const c = withRows(rangeBase, upBreak);
    const os = run(c);
    const r = of(os, "range")[0]!;
    const a = toAnnotations([r], { viewTf: "H1", until: r.known_at + SEC, projected: new Set() });
    expect(a[0]!.kind).toBe("zone");
    expect(a[0]!.role).toBe("range");
    const t = of(run(tlBase), "trendline")[0]!;
    const [la] = toAnnotations([t], { viewTf: "H1", until: t.known_at, projected: new Set() });
    expect(la!.kind).toBe("line");
    expect(describeObject(t, "headline", { viewTf: "H1" }).headline).toMatch(/^H1 Rising support line/);
    for (const x of [a[0]!, la!]) {
      const wire = JSON.parse(JSON.stringify(x, (k, v) => (typeof v === "number" && ["t", "t0", "t1", "known_at"].includes(k) ? toIsoUtc(v) : v)));
      expect(AnnotationSchema.safeParse(wire).success).toBe(true);
    }
    expect(viewAsOf(os, r.known_at - 1).filter((o) => o.type === "range")).toEqual([]);
  });

  it("5,000 bars stay inside the detection budget", () => {
    for (const tf of ["M15", "M1"] as const) {
      const bars = deepCandles("EUR_USD", tf).slice(0, 5000) as Candle[];
      const k = kern(bars, tf);
      const c = ctxFor(tf);
      const prior = [...fvgDetector.run(k, c), ...sdDetector.run(k, c)];
      const t0 = performance.now();
      const n = paDetector.run(k, c, prior).length;
      const ms = performance.now() - t0;
      console.log(`Price-action detector: ${n} objects, 5000 ${tf} bars, ${ms.toFixed(1)} ms`);
      expect(ms).toBeLessThan(150);
    }
  });
});