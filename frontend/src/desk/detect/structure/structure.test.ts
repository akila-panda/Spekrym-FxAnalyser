import { describe, expect, it } from "vitest";
import { AnnotationSchema } from "@/types/schemas";
import { toIsoUtc } from "@/lib/time";
import { defaultSettingsMap } from "@/desk/layers/layerStore";
import { toAnnotations } from "@/desk/layers/adapter";
import { selectForView } from "@/desk/layers/projection";
import { bosBull, chochBear, chochFailed } from "@/desk/__fixtures__/structure";
import { range, trend } from "@/desk/__fixtures__/fixtures";
import { deepCandles } from "@/desk/mock/deepMock";
import { checkObjectsNoLookahead } from "@/desk/kernel/harness";
import { runKernel } from "@/desk/kernel/kernel";
import { viewAsOf } from "@/desk/kernel/viewAsOf";
import { DEFAULTS } from "@/desk/methodology/defaults";
import type { Candle } from "@/types/market";
import { analyzeStructure, type StructCfg } from "./analyze";
import { structureKind } from "./kinds";
import { structureDetector } from "./structureDetector";

const ctx = { pair: "EUR_USD", tf: "H1", asOf: Infinity, dataKind: "sample", rulesVersion: "rtest" } as const;
const kern = (c: Candle[], tf: "H1" | "M15" = "H1") => runKernel(c, { pair: "EUR_USD", tf, asOf: Infinity });
const objs = (c: Candle[]) => structureDetector.run(kern(c), ctx);
const events = (c: Candle[], cfg: StructCfg = DEFAULTS) => analyzeStructure(kern(c), cfg).events;

describe("structure analysis", () => {
  it("labels HH/HL and reads a bull trend with BOS up", () => {
    const r = analyzeStructure(kern(bosBull));
    expect(r.swings.map((s) => s.label).filter(Boolean)).toEqual(expect.arrayContaining(["HH", "HL"]));
    expect(r.trend).toBe("bull");
    const ev = r.events;
    expect(ev.length).toBeGreaterThanOrEqual(2);
    expect(ev.every((e) => e.kind === "BOS" && e.dir === "bull")).toBe(true);
    expect(r.protectedLevels.length).toBeGreaterThan(0);
  });

  it("CHoCH bear against a bull trend; confirmed later; never a BOS before it", () => {
    const ev = events(chochBear);
    const ch = ev.find((e) => e.kind === "CHoCH")!;
    expect(ch.dir).toBe("bear");
    expect(ch.priorTrend).toBe("bull");
    expect(ch.confirmed_at).not.toBeNull();
    expect(ch.confirmed_at!).toBeGreaterThan(ch.known_at);
    expect(ch.failed_at).toBeNull();
    const r = analyzeStructure(kern(chochBear));
    expect(r.trend).toBe("bear");
    expect(r.protectedLevels.some((p) => p.ended?.kind === "broken")).toBe(true);
  });

  it("failed CHoCH: price closes back beyond the prior extreme", () => {
    const ch = events(chochFailed).find((e) => e.kind === "CHoCH")!;
    expect(ch.failed_at).not.toBeNull();
    expect(ch.confirmed_at).toBeNull();
    const o = objs(chochFailed).find((x) => structureKind(x) === "CHoCH")!;
    expect(o.lifecycle[0]?.kind).toBe("invalidated");
    expect(o.grade?.factors.some((f) => f.id === "follow" && f.status === "opposes")).toBe(true);
  });

  it("ranges and thin data are transitioning with no events", () => {
    const r = analyzeStructure(kern(range.candles));
    expect(r.trend).toBe("transitioning");
    expect(r.events).toEqual([]);
    expect(r.swings.some((s) => s.label === "EH")).toBe(true);
    const thin = analyzeStructure(kern(trend.candles.slice(0, 40)));
    expect(thin.trend).toBe("transitioning");
    expect(thin.events).toEqual([]);
  });

  it("wick rule breaks no later than the close rule", () => {
    const c = events(bosBull)[0]!;
    const w = events(bosBull, { structure: { breakRule: "wick", minBreakAtr: 0.1 } })[0]!;
    expect(w.known_at).toBeLessThanOrEqual(c.known_at);
  });

  it("min-break filters a marginal break", () => {
    const huge = events(bosBull, { structure: { breakRule: "close", minBreakAtr: 50 } });
    expect(huge).toEqual([]);
  });
});

describe("structure detector objects", () => {
  it("ids exclude price; kinds decode; swings labelled", () => {
    const a = objs(chochBear).map((o) => o.id);
    const shifted = chochBear.map((c) => ({ ...c, open: c.open + 1, high: c.high + 1, low: c.low + 1, close: c.close + 1 }));
    expect(objs(shifted).map((o) => o.id)).toEqual(a);
    const kinds = new Set(objs(chochBear).map(structureKind));
    expect(kinds.has("CHoCH") && kinds.has("protected")).toBe(true);
    expect(objs(bosBull).some((o) => o.type === "swing" && o.grade?.factors.some((f) => f.id === "label" && f.label === "HH"))).toBe(true);
  });
  it("copy never predicts", () => {
    const text = objs(chochBear).flatMap((o) => o.evidence.map((e) => e.note ?? "")).join(" ").toLowerCase();
    expect(text).not.toMatch(/reversal|will |likely|buy|sell/);
  });
});

describe("no-lookahead harness: structure", () => {
  const sets: [string, Candle[]][] = [
    ["bosBull", bosBull], ["chochBear", chochBear], ["chochFailed", chochFailed], ["range", range.candles],
    ["deep-H1", deepCandles("EUR_USD", "H1").slice(0, 900) as Candle[]],
  ];
  it.each(sets)("%s", (_n, bars) => {
    expect(checkObjectsNoLookahead(bars, "H1", (b) => structureDetector.run(kern(b as Candle[]), ctx), 60)).toEqual([]);
  });
  it("as-of hides a CHoCH's later confirmation and failure", () => {
    const all = objs(chochFailed);
    const ch = all.find((o) => structureKind(o) === "CHoCH")!;
    const early = viewAsOf(all, ch.known_at).find((o) => o.id === ch.id)!;
    expect(early.lifecycle).toEqual([]);
  });
});

describe("chart contract", () => {
  const wire = (a: unknown): unknown =>
    JSON.parse(JSON.stringify(a, (k, v) => (typeof v === "number" && ["t0", "t1", "known_at", "plot_time", "mitigated_at", "t"].includes(k) ? toIsoUtc(v) : v)));
  it("BOS/CHoCH are lines (CHoCH dashed), protected is a level; all schema-valid", () => {
    const o = objs(chochBear);
    const out = toAnnotations(o, { viewTf: "H1", until: chochBear[chochBear.length - 1]!.time, projected: new Set() });
    const lines = out.filter((a) => a.kind === "line");
    expect(lines.some((a) => a.label === "Bearish CHoCH" && (a as { dash?: string }).dash === "dashed")).toBe(true);
    expect(lines.some((a) => a.label === "Bullish BOS")).toBe(true);
    expect(out.some((a) => a.kind === "level" && /^Protected/.test(a.label ?? ""))).toBe(true);
    for (const a of out) expect(AnnotationSchema.safeParse(wire(a)).success, JSON.stringify(a)).toBe(true);
  });
  it("a D structure event projects quiet onto M5 and keeps source_tf", () => {
    const o = objs(chochBear).filter((x) => structureKind(x) === "CHoCH").map((x) => ({ ...x, source_tf: "D" as const }));
    const settings = defaultSettingsMap();
    settings.structure.visible = true;
    const sel = selectForView({ objects: o, viewTf: "M5", asOf: Infinity, settings, complexity: "standard", price: o[0]!.geometry.bands[0]!.pHigh, atrView: 0.001 });
    expect(sel.projected.size).toBe(1);
    const [a] = toAnnotations(sel.objects, { viewTf: "M5", until: 1e10, projected: sel.projected });
    expect(a?.emphasis).toBe("faint");
    expect(a?.source_tf).toBe("D");
  });
  it("deep mock yields events within the 150 ms budget", () => {
    const bars = deepCandles("EUR_USD", "H1").slice(0, 2000) as Candle[];
    const t0 = performance.now();
    const k = kern(bars);
    const r = analyzeStructure(k);
    expect(performance.now() - t0).toBeLessThan(150);
    expect(r.swings.length).toBeGreaterThan(5);
  });
});