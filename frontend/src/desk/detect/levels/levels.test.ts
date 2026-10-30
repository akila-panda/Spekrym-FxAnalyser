import { describe, expect, it } from "vitest";
import { srCycle, strongSingle, sessionDay } from "@/desk/__fixtures__/levels";
import { range, trend } from "@/desk/__fixtures__/fixtures";
import { deepCandles } from "@/desk/mock/deepMock";
import { checkObjectsNoLookahead } from "@/desk/kernel/harness";
import { runKernel } from "@/desk/kernel/kernel";
import { lifecycleState, viewAsOf } from "@/desk/kernel/viewAsOf";
import { DEFAULTS } from "@/desk/methodology/defaults";
import { toAnnotations } from "@/desk/layers/adapter";
import { describeObject } from "@/desk/evidence/describe";
import { toIsoUtc } from "@/lib/time";
import { AnnotationSchema } from "@/types/schemas";
import { TF_SECONDS, type Candle, type Timeframe } from "@/types/market";
import { levelName, touchCount } from "./names";
import { findReactions } from "./reactions";
import { referenceDetector } from "./referenceDetector";
import { srDetector } from "./srDetector";

const ctxFor = (tf: Timeframe, cfg?: typeof DEFAULTS) =>
  ({ pair: "EUR_USD", tf, asOf: Infinity, dataKind: "sample", rulesVersion: "rtest", ...(cfg ? { cfg } : {}) }) as const;
const kern = (c: Candle[], tf: Timeframe = "H1") => runKernel(c, { pair: "EUR_USD", tf, asOf: Infinity });
const sr = (c: Candle[], tf: Timeframe = "H1", cfg?: typeof DEFAULTS) => srDetector.run(kern(c, tf), ctxFor(tf, cfg));
const ref = (c: Candle[], tf: Timeframe) => referenceDetector.run(kern(c, tf), ctxFor(tf));
const deep = (tf: Timeframe, n: number) => deepCandles("EUR_USD", tf).slice(0, n) as Candle[];

describe("S/R bands", () => {
  const objs = sr(srCycle);
  const support = objs.find((o) => o.direction === "bull")!;
  const resist = objs.find((o) => o.direction === "bear")!;

  it("clusters three equal lows into one respected support band (intraday needs 3)", () => {
    expect(support).toBeDefined();
    expect(support.type).toBe("sr_level");
    expect(support.layer).toBe("levels");
    expect(support.grade?.factors.find((f) => f.id === "touches")?.value).toBe(3);
    const b = support.geometry.bands[0]!;
    expect(b.pLow).toBeCloseTo(1.0996, 4);
    expect(b.pHigh).toBeLessThan(1.1005);
    expect(support.lifecycle[0]?.kind).toBe("established");
    expect(support.lifecycle[0]?.known_at).toBe(support.known_at);
    expect(resist.geometry.bands[0]!.pHigh).toBeCloseTo(1.1034, 4);
  });

  it("lifecycle: established → broken → role_reversed, in order", () => {
    expect(support.lifecycle.map((e) => e.kind)).toEqual(["established", "broken", "role_reversed"]);
    const t = support.lifecycle.map((e) => e.known_at);
    expect(t).toEqual([...t].sort((a, b) => a - b));
    expect(lifecycleState(support)).toBe("role_reversed");
    expect(levelName(support)).toMatch(/^Resistance ×4/); // flipped by role reversal; 3 + 1 retest
    expect(touchCount(support)).toBe(4);
  });

  it("strong single reaction establishes with one reaction", () => {
    const [o] = sr(strongSingle).filter((x) => x.grade?.factors.some((f) => f.id === "strong"));
    expect(o).toBeDefined();
    expect(touchCount(o!)).toBe(1);
  });

  it("reactions closer than minGapBars are ignored", () => {
    const cfg = { ...DEFAULTS, levels: { ...DEFAULTS.levels, minGapBars: 1000 } } as unknown as typeof DEFAULTS;
    const out = sr(srCycle, "H1", cfg);
    expect(out.every((o) => touchCount(o) === 1 && o.grade!.factors.some((f) => f.id === "strong"))).toBe(true);
    expect(out.length).toBeLessThan(objs.length + 1);
  });

  it("band width never exceeds the cap; ATR warm-up stays quiet", () => {
    const k = kern(srCycle);
    const maxAtr = Math.max(...(k.atr.filter((x) => x !== null) as number[]));
    for (const o of objs) {
      const b = o.geometry.bands[0]!;
      expect(b.pHigh - b.pLow).toBeLessThanOrEqual(DEFAULTS.levels.bandCapAtr * maxAtr + 1e-12);
    }
    expect(sr(trend.candles.slice(0, 14))).toEqual([]);
  });

  it("a reaction needs departure ≥ reactAtr without closing through", () => {
    const rs = findReactions(kern(srCycle), DEFAULTS);
    expect(rs.length).toBeGreaterThan(5);
    expect(rs.every((r) => r.departAtr >= DEFAULTS.levels.reactAtr)).toBe(true);
    expect(rs.every((r) => r.known_at >= r.swing.known_at)).toBe(true);
  });

  it("ids exclude price; copy never predicts", () => {
    const shifted = srCycle.map((c) => ({ ...c, open: c.open + 1, high: c.high + 1, low: c.low + 1, close: c.close + 1 }));
    expect(sr(shifted).map((o) => o.id)).toEqual(objs.map((o) => o.id));
    const text = objs.flatMap((o) => o.evidence.map((e) => e.note ?? "")).join(" ").toLowerCase();
    expect(text).not.toMatch(/reversal|will |likely|buy|sell/);
  });

  it("as-of hides later tests/breaks and the object itself before establishment", () => {
    const early = viewAsOf(objs, support.known_at).find((o) => o.id === support.id)!;
    expect(early.lifecycle.map((e) => e.kind)).toEqual(["established"]);
    expect(viewAsOf(objs, support.known_at - 1).some((o) => o.id === support.id)).toBe(false);
  });
});

describe("reference levels", () => {
  it("PDH/PDL/PDC come from the prior D bar and are known at its close", () => {
    const d = deep("D", 60);
    const sec = TF_SECONDS.D;
    const objs = ref(d, "D");
    const label = (o: (typeof objs)[number]) => o.grade!.factors.find((f) => f.id === "label")!.label;
    const j = 10;
    const bar = d[j]!;
    const pdh = objs.find((o) => label(o) === "PDH" && o.known_at === bar.time + sec)!;
    expect(pdh.geometry.bands[0]!.pHigh).toBe(bar.high);
    expect(objs.find((o) => label(o) === "PDL" && o.known_at === bar.time + sec)!.geometry.bands[0]!.pLow).toBe(bar.low);
    expect(objs.find((o) => label(o) === "PDC" && o.known_at === bar.time + sec)!.geometry.bands[0]!.pHigh).toBe(bar.close);
    expect(pdh.lifecycle[0]).toMatchObject({ kind: "superseded", known_at: d[j + 1]!.time + sec });
    const latest = objs.filter((o) => label(o) === "PDH").at(-1)!;
    expect(latest.lifecycle).toEqual([]);
    expect(levelName(pdh)).toBe("PDH");
  });

  it("PWH/PWL come from W; nothing on other TFs", () => {
    const w = deep("W", 30);
    expect(ref(w, "W").some((o) => o.grade!.factors.some((f) => f.label === "PWH"))).toBe(true);
    expect(ref(deep("M15", 200), "M15")).toEqual([]);
    expect(ref(deep("H4", 200), "H4")).toEqual([]);
  });

  it("H1: day/week open, completed session high/low (approx), round numbers", () => {
    const objs = ref(sessionDay, "H1");
    const by = (l: string) => objs.filter((o) => o.grade!.factors.some((f) => f.label === l));
    expect(by("Day open").length).toBeGreaterThanOrEqual(2);
    expect(by("Week open").length).toBeGreaterThanOrEqual(1);
    const asia = by("Asia high (approx)")[0]!;
    expect(asia.geometry.bands[0]!.pHigh).toBe(1.103);
    expect(asia.known_at).toBe(sessionDay[0]!.time + 8 * 3600);
    expect(asia.grade!.factors.some((f) => f.id === "approx")).toBe(true);
    expect(by("London low (approx)")[0]!.geometry.bands[0]!.pLow).toBe(1.097);
    expect(by("Round 1.10000").length).toBe(1);
    // NY (12–21) completes at 21:00 on day 0 → present; second Asia high supersedes nothing yet
    expect(by("Ny high (approx)").length).toBeGreaterThan(0);
  });

  it("round numbers are known only once traded (no future range)", () => {
    const objs = ref(sessionDay, "H1");
    const r = objs.find((o) => o.grade!.factors.some((f) => f.label === "Round 1.10000"))!;
    expect(r.known_at).toBe(sessionDay[0]!.time + 3600);
  });
});

describe("no-lookahead harness: levels", () => {
  const sets: [string, Candle[], Timeframe][] = [
    ["srCycle", srCycle, "H1"], ["strongSingle", strongSingle, "H1"], ["sessionDay", sessionDay, "H1"],
    ["range", range.candles, "H1"], ["deep-H1", deep("H1", 700), "H1"], ["deep-M15", deep("M15", 600), "M15"],
    ["deep-D", deep("D", 120), "D"], ["deep-W", deep("W", 80), "W"],
  ];
  it.each(sets)("sr + reference: %s", (_n, bars, tf) => {
    const run = (b: Candle[]) => {
      const k = runKernel(b, { pair: "EUR_USD", tf, asOf: Infinity });
      return [...srDetector.run(k, ctxFor(tf)), ...referenceDetector.run(k, ctxFor(tf))];
    };
    expect(checkObjectsNoLookahead(bars, tf, run, 40)).toEqual([]);
  });
});

describe("chart contract", () => {
  const wire = (a: unknown): unknown =>
    JSON.parse(JSON.stringify(a, (k, v) => (typeof v === "number" && ["t0", "t1", "known_at", "plot_time", "mitigated_at", "t"].includes(k) ? toIsoUtc(v) : v)));
  it("S/R is a band (zone), reference is a level; labels carry touch count / name; schema-valid", () => {
    const objs = [...sr(srCycle), ...ref(sessionDay, "H1")];
    const out = toAnnotations(objs, { viewTf: "H1", until: srCycle.at(-1)!.time, projected: new Set() });
    expect(out.some((a) => a.kind === "zone" && /^(Support|Resistance) ×\d/.test(a.label ?? ""))).toBe(true);
    expect(out.some((a) => a.kind === "level" && a.label === "Day open")).toBe(true);
    for (const a of out) expect(AnnotationSchema.safeParse(wire(a)).success, JSON.stringify(a)).toBe(true);
  });
  it("evidence shows pips with ATR secondary", () => {
    const o = sr(srCycle)[0]!;
    expect(describeObject(o, "headline", { atr: 0.0006 }).headline).toMatch(/pips · [\d.]+ ATR/);
  });
  it("perf: sr + reference on 2000 deep H1 bars", () => {
    const k = kern(deep("H1", 2000));
    const t0 = performance.now();
    srDetector.run(k, ctxFor("H1"));
    referenceDetector.run(k, ctxFor("H1"));
    expect(performance.now() - t0).toBeLessThan(150);
  });
});