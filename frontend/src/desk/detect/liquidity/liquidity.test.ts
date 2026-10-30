import { describe, expect, it } from "vitest";
import { FIXTURES, sweep } from "@/desk/__fixtures__/fixtures";
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
import { buildRelations } from "../relations";
import { liquidityDetector } from "./liquidityDetector";
import { liquidityName } from "./names";

const SEC = TF_SECONDS.H1;
const ctxFor = (tf: Timeframe = "H1", cfg?: typeof DEFAULTS) =>
  ({ pair: "EUR_USD", tf, asOf: Infinity, dataKind: "sample", rulesVersion: "rtest", ...(cfg ? { cfg } : {}) }) as const;
const kern = (c: Candle[], tf: Timeframe = "H1") => runKernel(c, { pair: "EUR_USD", tf, asOf: Infinity });
const run = (c: Candle[], tf: Timeframe = "H1", cfg?: typeof DEFAULTS) => liquidityDetector.run(kern(c, tf), ctxFor(tf, cfg));
const withCfg = (liq: Record<string, unknown>) => ({ ...DEFAULTS, liquidity: { ...DEFAULTS.liquidity, ...liq } }) as unknown as typeof DEFAULTS;
const pools = (os: ReturnType<typeof run>) => os.filter((o) => o.type === "liquidity_pool");
const sweeps = (os: ReturnType<typeof run>) => os.filter((o) => o.type === "sweep");
const kinds = (o: { lifecycle: { kind: string }[] }) => o.lifecycle.map((e) => e.kind);

// fixture: equal highs idx 11 & 35 (1.1102), wick-sweep bar idx 48 (high 1.1115, close 1.107), then 3 falling bars. 12 more bars complete the window.
const more: Row[] = [...flatRows(12, 1.1008, 0.0004)];
const long = [...sweep.candles, ...fromRows("H1", more, sweep.candles.length)];

describe("liquidity pools", () => {
  const os = run(sweep.candles);
  const pool = pools(os).find((p) => p.direction === "bear")!;

  it("finds the fixture's equal highs as a potential pool, known at the 2nd swing's confirmation close", () => {
    expect(pool.type).toBe("liquidity_pool");
    expect(pool.layer).toBe("liquidity");
    expect(pool.geometry.bands[0]!.pHigh).toBeCloseTo(1.1102, 6);
    expect(pool.geometry.anchorTimes).toEqual([sweep.candles[11]!.time, sweep.candles[35]!.time]);
    expect(pool.t_event).toBe(sweep.candles[35]!.time);
    expect(pool.known_at).toBe(sweep.candles[38]!.time + SEC);
    expect(pool.lifecycle[0]).toEqual({ kind: "potential", t: pool.known_at, known_at: pool.known_at });
    expect(pool.id).toBe(`liquidity_pool:EUR_USD:H1:${sweep.candles[11]!.time}-${sweep.candles[35]!.time}`);
  });

  it("pool exists before the sweep (as-of between them shows a potential pool and no sweep)", () => {
    const s = sweeps(os)[0]!;
    expect(pool.known_at).toBeLessThan(s.known_at);
    const v = viewAsOf(os, s.known_at - 1);
    expect(v.filter((o) => o.type === "sweep")).toEqual([]);
    expect(lifecycleState(v.find((o) => o.id === pool.id)!)).toBe("potential");
  });

  it("equal lows mirror equal highs", () => {
    const m = sweep.candles.map((c) => ({ ...c, open: 2.2 - c.open, high: 2.2 - c.low, low: 2.2 - c.high, close: 2.2 - c.close }));
    const b = pools(run(m)).find((p) => p.direction === "bull")!;
    expect(b.geometry.bands[0]!.pLow).toBeCloseTo(2.2 - 1.1102, 6);
    expect(b.known_at).toBe(pool.known_at);
    expect(sweeps(run(m))[0]!.direction).toBe("bull");
  });

  it("tolerance is ATR-based; window is trading days", () => {
    expect(pools(run(sweep.candles, "H1", withCfg({ eqAtr: 0.1 }))).length).toBeGreaterThan(0);
    // swings 24 bars (1 day) apart: a 1-day window cannot hold both
    expect(pools(run(sweep.candles, "H1", withCfg({ lookbackDays: 1 }))).filter((p) => p.direction === "bear")).toEqual([]);
  });

  it("a third equal swing is absorbed, not a duplicate pool", () => {
    const rows = [...sweep.candles.slice(0, 48)];
    expect(pools(run(rows)).filter((p) => p.direction === "bear")).toHaveLength(1);
  });

  it("ids exclude price; copy never predicts", () => {
    const shifted = sweep.candles.map((c) => ({ ...c, open: c.open + 1, high: c.high + 1, low: c.low + 1, close: c.close + 1 }));
    expect(run(shifted).map((x) => x.id)).toEqual(os.map((x) => x.id));
    const text = os.flatMap((o) => [...o.evidence.map((e) => e.note ?? ""), ...o.grade!.factors.map((f) => f.label), liquidityName(o) ?? ""]).join(" ").toLowerCase();
    expect(text).not.toMatch(/reversal|will |likely|buy|sell|probab|forming/);
    expect(text).toContain("potential");
  });
});

describe("sweeps", () => {
  const os = run(sweep.candles);
  const s = sweeps(os)[0]!;

  it("classifies the fixture bar as a wick sweep with causal timing", () => {
    expect(sweeps(os)).toHaveLength(1);
    expect(s.direction).toBe("bear");
    expect(s.t_event).toBe(sweep.candles[48]!.time);
    expect(s.known_at).toBe(sweep.candles[48]!.time + SEC);
    expect(s.grade!.factors.some((f) => f.id === "wick_sweep")).toBe(true);
    expect(s.geometry.bands[0]).toEqual({ pHigh: 1.1115, pLow: 1.1102 });
    expect(s.evidence[0]!.objectId).toBe(pools(os).find((p) => p.direction === "bear")!.id);
  });

  it("a close beyond the pool is classified close_beyond", () => {
    const rows = sweep.candles.map((c, i) => (i === 48 ? { ...c, close: 1.1112, high: 1.1115 } : c));
    const x = sweeps(run(rows))[0]!;
    expect(x.grade!.factors.some((f) => f.id === "close_beyond")).toBe(true);
    expect(liquidityName(x)).toBe("Close beyond · equal highs");
  });

  it("minimum depth is ATR-based", () => {
    expect(sweeps(run(sweep.candles, "H1", withCfg({ sweepAtr: 50 })))).toEqual([]);
  });

  it("pool lifecycle: potential → swept → reaction_observed → resolved, each known at its bar close", () => {
    const os2 = run(long);
    const p = pools(os2).find((x) => x.direction === "bear")!;
    expect(kinds(p)).toEqual(["potential", "swept", "reaction_observed", "resolved"]);
    const t = p.lifecycle.map((e) => e.known_at);
    expect(t).toEqual([...t].sort((a, b) => a - b));
    expect(p.lifecycle[1]!.known_at).toBe(long[48]!.time + SEC);
    expect(p.lifecycle[1]!.detail).toMatchObject({ sweep: "wick" });
    expect(p.lifecycle[3]!.known_at).toBe(long[58]!.time + SEC);
    expect(p.lifecycle[3]!.detail).toEqual({ reacted: 1 });
  });

  it("follow-through facts are independent: reaction and displacement are separate events", () => {
    const x = sweeps(run(long))[0]!;
    expect(kinds(x)).toContain("reaction_observed");
    expect(kinds(x)).toContain("displacement_followed");
    expect(kinds(x)[0]).toBe("observed");
    const noReact = sweeps(run(long, "H1", withCfg({ followAtr: 500 })))[0]!;
    expect(kinds(noReact)).not.toContain("reaction_observed");
    expect(kinds(noReact)).toContain("displacement_followed");
    expect(noReact.lifecycle.find((e) => e.kind === "resolved")!.detail).toEqual({ reacted: 0 });
  });

  it("unswept pool is superseded when its window ends; no sweep after that", () => {
    const rows = sweep.candles.slice(0, 48);
    const filler: Row[] = flatRows(24 * 6, 1.1, 0.0004);
    const spike: Row[] = [[1.1, 1.113, 1.0998, 1.1]];
    const os3 = run([...rows, ...fromRows("H1", filler, 48), ...fromRows("H1", spike, 48 + filler.length)]);
    const p = pools(os3).find((x) => x.direction === "bear")!;
    expect(kinds(p)).toEqual(["potential", "superseded"]);
    expect(sweeps(os3).filter((x) => x.direction === "bear")).toEqual([]);
  });
});

describe("as-of folding", () => {
  it("lifecycle events only appear once knowable", () => {
    const os = run(long);
    const p = pools(os).find((x) => x.direction === "bear")!;
    const mid = viewAsOf([p], long[49]!.time + SEC)[0]!;
    expect(kinds(mid)).toEqual(["potential", "swept", "reaction_observed"]);
    expect(viewAsOf([p], p.known_at - 1)).toEqual([]);
  });
});

describe("no-lookahead harness: liquidity", () => {
  const sets: [string, Candle[]][] = [
    ...FIXTURES.map((x) => [x.name, x.candles] as [string, Candle[]]),
    ["long", long],
    ["deep-H1", deepCandles("EUR_USD", "H1").slice(0, 900) as Candle[]],
  ];
  for (const [name, bars] of sets) {
    it(`prefix-equal — ${name}`, () => {
      expect(checkObjectsNoLookahead(bars, "H1", (b) => run(b))).toEqual([]);
    });
  }
  it("prefix-equal — deep M15 (sweeps + follow-through)", () => {
    const bars = deepCandles("EUR_USD", "M15").slice(0, 1200) as Candle[];
    expect(checkObjectsNoLookahead(bars, "M15", (b) => run(b, "M15"), 30)).toEqual([]);
    expect(run(bars, "M15").some((o) => o.type === "sweep")).toBe(true);
  });
});

describe("integration", () => {
  it("describe + adapter: neutral copy, valid annotations on liquidity/sweep roles", () => {
    const os = run(long);
    const p = pools(os).find((x) => x.direction === "bear")!;
    const s = sweeps(os)[0]!;
    expect(describeObject(p, "evidence", { viewTf: "H1" }).headline).toMatch(/^H1 Potential pool · equal highs · 1\.1102/);
    expect(describeObject(s, "explanation", { viewTf: "H1" }).headline).toMatch(/^H1 Wick sweep · equal highs/);
    const ann = toAnnotations([p, s], { viewTf: "H1", until: p.known_at + SEC, projected: new Set() });
    expect(ann.map((a) => a.role).sort()).toEqual(["liquidity", "sweep"]);
    for (const a of ann) {
      const wire = JSON.parse(JSON.stringify(a, (k, v) => (typeof v === "number" && ["t0", "t1", "known_at"].includes(k) ? toIsoUtc(v) : v)));
      expect(AnnotationSchema.safeParse(wire).success).toBe(true);
    }
  });

  it("pool and sweep relate in price", () => {
    const os = run(long);
    expect(buildRelations(os).some((r) => ["overlap", "contains"].includes(r.kind))).toBe(true);
  });

  it("5,000 bars stay inside the detection budget", () => {
    for (const tf of ["M15", "M1"] as const) {
      const bars = deepCandles("EUR_USD", tf).slice(0, 5000) as Candle[];
      const k = kern(bars, tf);
      const t0 = performance.now();
      const n = liquidityDetector.run(k, ctxFor(tf)).length;
      const ms = performance.now() - t0;
      console.log(`Liquidity detector: ${n} objects, 5000 ${tf} bars, ${ms.toFixed(1)} ms`);
      expect(ms).toBeLessThan(150);
    }
  });
});