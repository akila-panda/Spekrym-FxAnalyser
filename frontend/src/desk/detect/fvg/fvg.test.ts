import { describe, expect, it } from "vitest";
import { FIXTURES, fvg } from "@/desk/__fixtures__/fixtures";
import { fromRows, type Row } from "@/desk/__fixtures__/builders";
import { mkObj } from "@/desk/__fixtures__/objects";
import { describeObject } from "@/desk/evidence/describe";
import { toAnnotations } from "@/desk/layers/adapter";
import { checkObjectsNoLookahead } from "@/desk/kernel/harness";
import { runKernel } from "@/desk/kernel/kernel";
import { lifecycleState, viewAsOf } from "@/desk/kernel/viewAsOf";
import { DEFAULTS } from "@/desk/methodology/defaults";
import { deepCandles } from "@/desk/mock/deepMock";
import { AnnotationSchema } from "@/types/schemas";
import { toIsoUtc } from "@/lib/time";
import { TF_SECONDS, type Candle, type Timeframe } from "@/types/market";
import { buildRelations } from "../relations";
import { fvgDetector } from "./fvgDetector";
import { isFvgActive, nearestFvgs } from "./nearest";

const SEC = TF_SECONDS.H1;
const ctxFor = (tf: Timeframe = "H1", cfg?: typeof DEFAULTS) =>
  ({ pair: "EUR_USD", tf, asOf: Infinity, dataKind: "sample", rulesVersion: "rtest", ...(cfg ? { cfg } : {}) }) as const;
const kern = (c: Candle[], tf: Timeframe = "H1") => runKernel(c, { pair: "EUR_USD", tf, asOf: Infinity });
const run = (c: Candle[], tf: Timeframe = "H1", cfg?: typeof DEFAULTS) => fvgDetector.run(kern(c, tf), ctxFor(tf, cfg));
const withCfg = (fvgCfg: Record<string, unknown>) => ({ ...DEFAULTS, fvg: { ...DEFAULTS.fvg, ...fvgCfg } }) as unknown as typeof DEFAULTS;

// fixture bars: a=19 (high 1.1004), b=20 impulse, c=21 (low 1.101). Then four bars that walk through the gap.
const tail: Row[] = [
  [1.1032, 1.1033, 1.1008, 1.1012], // wick enters the gap, closes above
  [1.1012, 1.1013, 1.1002, 1.1006], // wick through far edge, close still inside/above
  [1.1006, 1.1007, 1.0998, 1.1], // closes beyond far edge
  [1.1, 1.1006, 1.0999, 1.1001], // retests from below, closes back below
];
const walk = [...fvg.candles, ...fromRows("H1", tail, fvg.candles.length)];
const pick = (os: ReturnType<typeof run>) => os.find((o) => o.t_event === fvg.candles[20]!.time)!;

describe("FVG detection", () => {
  const [o] = run(fvg.candles);

  it("finds the fixture's bullish gap with frozen band, CE and causal timing", () => {
    expect(run(fvg.candles)).toHaveLength(1);
    expect(o!.type).toBe("fvg");
    expect(o!.layer).toBe("fvg");
    expect(o!.direction).toBe("bull");
    expect(o!.geometry.bands[0]).toEqual({ pHigh: 1.101, pLow: 1.1004 });
    expect(o!.geometry.points![0]!.p).toBeCloseTo(1.1007, 6);
    expect(o!.t_event).toBe(fvg.candles[20]!.time);
    expect(o!.known_at).toBe(fvg.candles[21]!.time + SEC);
    expect(o!.lifecycle).toEqual([{ kind: "open", t: o!.known_at, known_at: o!.known_at }]);
    expect(o!.grade!.factors.some((f) => f.id === "ce")).toBe(true);
  });

  it("origin_id links the displacement that formed it (only when already knowable)", () => {
    expect(o!.origin_id).toBe(`disp:EUR_USD:H1:${fvg.candles[20]!.time}`);
    const deep = deepCandles("EUR_USD", "H1").slice(0, 1500) as Candle[];
    const k = kern(deep);
    const byId = new Map(k.displacements.map((d) => [d.id, d]));
    for (const f of fvgDetector.run(k, ctxFor())) if (f.origin_id) expect(byId.get(f.origin_id)!.known_at).toBeLessThanOrEqual(f.known_at);
  });

  it("bearish gap is the mirror image", () => {
    const m = fvg.candles.map((c) => ({ ...c, open: 2.2 - c.open, high: 2.2 - c.low, low: 2.2 - c.high, close: 2.2 - c.close }));
    const [b] = run(m);
    expect(b!.direction).toBe("bear");
    expect(b!.geometry.bands[0]!.pHigh).toBeCloseTo(2.2 - 1.1004, 6);
    expect(b!.geometry.bands[0]!.pLow).toBeCloseTo(2.2 - 1.101, 6);
    expect(b!.known_at).toBe(o!.known_at);
  });

  it("min size is enforced in ATR; ATR warm-up stays quiet", () => {
    expect(run(fvg.candles, "H1", withCfg({ minAtr: 5 }))).toEqual([]);
    expect(run(fvg.candles.slice(0, 14))).toEqual([]);
  });

  it("ids exclude price; copy never predicts", () => {
    const shifted = fvg.candles.map((c) => ({ ...c, open: c.open + 1, high: c.high + 1, low: c.low + 1, close: c.close + 1 }));
    expect(run(shifted).map((x) => x.id)).toEqual(run(fvg.candles).map((x) => x.id));
    const text = [...o!.evidence.map((e) => e.note ?? ""), ...o!.grade!.factors.map((f) => f.label)].join(" ").toLowerCase();
    expect(text).not.toMatch(/reversal|will |likely|buy|sell|probab/);
  });
});

describe("FVG lifecycle", () => {
  const kinds = (c: Candle[], cfg?: typeof DEFAULTS) => pick(run(c, "H1", cfg)).lifecycle.map((e) => e.kind);

  it("wick rule: open → partially_filled → filled → invalidated → inverted, each known at its bar close", () => {
    const f = pick(run(walk));
    expect(f.lifecycle.map((e) => e.kind)).toEqual(["open", "partially_filled", "filled", "invalidated", "inverted"]);
    expect(f.lifecycle[1]!.detail!.depth).toBeCloseTo(0.33, 2);
    f.lifecycle.slice(1).forEach((e, i) => expect(e.known_at).toBe(walk[27 + i]!.time + SEC));
    expect(lifecycleState(f)).toBe("inverted");
    expect(isFvgActive(f)).toBe(false);
  });

  it("close rule: filling needs a close through the far edge (filled + invalidated on the same bar)", () => {
    expect(kinds(walk, withCfg({ fillRule: "close" }))).toEqual(["open", "partially_filled", "filled", "invalidated", "inverted"]);
    const f = pick(run(walk.slice(0, 29), "H1", withCfg({ fillRule: "close" })));
    expect(f.lifecycle.map((e) => e.kind)).toEqual(["open", "partially_filled"]); // wick through far edge ≠ filled under close rule
    expect(isFvgActive(f)).toBe(true);
  });

  it("filled and invalidated are separate facts (wick fill, close stays inside)", () => {
    expect(kinds(walk.slice(0, 29))).toEqual(["open", "partially_filled", "filled"]);
  });

  it("as-of folds lifecycle and hides the gap before it was knowable", () => {
    const f = pick(run(walk));
    const mid = viewAsOf([f], walk[28]!.time + SEC)[0]!;
    expect(mid.lifecycle.map((e) => e.kind)).toEqual(["open", "partially_filled", "filled"]);
    expect(viewAsOf([f], f.known_at - 1)).toEqual([]);
  });
});

describe("no-lookahead harness: FVG", () => {
  const sets: [string, Candle[]][] = [...FIXTURES.map((x) => [x.name, x.candles] as [string, Candle[]]), ["walk", walk], ["deep-H1", deepCandles("EUR_USD", "H1").slice(0, 900) as Candle[]]];
  for (const [name, bars] of sets) {
    for (const rule of ["wick", "close"] as const) {
      it(`prefix-equal — ${name} (${rule})`, () => {
        const bad = checkObjectsNoLookahead(bars, "H1", (b) => run(b, "H1", withCfg({ fillRule: rule })));
        expect(bad).toEqual([]);
      });
    }
  }
});

describe("FVG helpers & integration", () => {
  it("nearestFvgs keeps the N nearest active gaps and skips spent ones", () => {
    const g = (lo: number, hi: number, life: string[] = ["open"]) =>
      mkObj({ type: "fvg", layer: "fvg", lo, hi, lifecycle: life.map((kind) => ({ kind, t: 1, known_at: 1 })) });
    const near = g(1.1, 1.101), far = g(1.12, 1.121), mid = g(1.105, 1.106), spent = g(1.1001, 1.1002, ["open", "filled"]);
    const out = nearestFvgs([far, spent, mid, near], 1.1004, 2);
    expect(out.map((x) => x.id)).toEqual([near.id, mid.id]);
    expect(nearestFvgs([near, mid, far], 1.1004).length).toBe(3);
  });

  it("overlapping gaps relate; an HTF gap containing an LTF gap is flagged nested", () => {
    const h4 = mkObj({ type: "fvg", layer: "fvg", source_tf: "H4", lo: 1.1, hi: 1.11 });
    const m15 = mkObj({ type: "fvg", layer: "fvg", source_tf: "M15", lo: 1.102, hi: 1.103 });
    const other = mkObj({ type: "fvg", layer: "fvg", source_tf: "M15", lo: 1.1025, hi: 1.1035 });
    const rels = buildRelations([h4, m15, other]);
    expect(rels.some((r) => r.kind === "nested" && r.aId === h4.id && r.bId === m15.id)).toBe(true);
    expect(rels.some((r) => r.kind === "overlap" && [r.aId, r.bId].sort().join() === [m15.id, other.id].sort().join())).toBe(true);
  });

  it("describe + adapter: neutral copy, valid Annotation zone on the imbalance role", () => {
    const f = pick(run(walk.slice(0, 23)));
    const d = describeObject(f, "evidence", { viewTf: "H1" });
    expect(d.headline).toMatch(/^H1 Bullish Fair value gap · 1\.10040–1\.10100/);
    const [a] = toAnnotations([f], { viewTf: "H1", until: f.known_at + 3600, projected: new Set() });
    expect(a!.kind).toBe("zone");
    expect(a!.role).toBe("imbalance");
    const wire = JSON.parse(JSON.stringify(a, (k, v) => (typeof v === "number" && ["t0", "t1", "known_at"].includes(k) ? toIsoUtc(v) : v)));
    expect(AnnotationSchema.safeParse(wire).success).toBe(true);
  });

  it("runs 5,000 bars well inside the detection budget", () => {
    const bars = deepCandles("EUR_USD", "M15").slice(0, 5000) as Candle[];
    const k = kern(bars, "M15");
    const t0 = performance.now();
    const n = fvgDetector.run(k, ctxFor("M15")).length;
    const ms = performance.now() - t0;
    console.log(`FVG detector: ${n} gaps, 5000 M15 bars, ${ms.toFixed(1)} ms`);
    expect(ms).toBeLessThan(150);
  });
});