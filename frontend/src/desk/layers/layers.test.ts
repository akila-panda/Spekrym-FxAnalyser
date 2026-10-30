import { beforeEach, describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { AnnotationSchema } from "@/types/schemas";
import { toIsoUtc } from "@/lib/time";
import { mkObj } from "@/desk/__fixtures__/objects";
import { zone } from "@/desk/__fixtures__/fixtures";
import { useDeskStore } from "@/desk/workspace/deskStore";
import { useDeskUiStore } from "@/desk/workspace/deskUiStore";
import { toAnnotations } from "./adapter";
import { defaultSettingsMap, parseLayerSettings, selectVisibleCount, useLayerStore } from "./layerStore";
import { PRESETS } from "./layerPresets";
import { projectsTo, selectForView, type SelectInput } from "./projection";
import { isRelevant } from "./relevance";
import { useDeskAnnotations } from "./useDeskAnnotations";

const wire = (a: unknown): unknown =>
  JSON.parse(JSON.stringify(a, (k, v) => (typeof v === "number" && ["t0", "t1", "known_at", "plot_time", "mitigated_at", "t"].includes(k) ? toIsoUtc(v) : v)));

const allOn = () => {
  const s = defaultSettingsMap();
  for (const k of Object.keys(s) as (keyof typeof s)[]) s[k].visible = true;
  return s;
};
const sel = (o: Partial<SelectInput> & Pick<SelectInput, "objects">): SelectInput => ({
  viewTf: "M5", asOf: Infinity, settings: allOn(), complexity: "standard", price: 1.1005, atrView: 0.001, ...o,
});

describe("adapter", () => {
  it("output validates against AnnotationSchema (zone, level, marker, line)", () => {
    const objs = [
      mkObj({ lo: 1.1, hi: 1.101, direction: "bull" }),
      mkObj({ type: "reference_level", layer: "levels", lo: 1.1, hi: 1.1 }),
      mkObj({ type: "swing", layer: "structure", direction: "bear", lo: 1.1, hi: 1.1, geometry: { bands: [{ pHigh: 1.1, pLow: 1.1 }], points: [{ t: 1_735_689_600, p: 1.1 }], anchorTimes: [1_735_689_600] } }),
      mkObj({ type: "trendline", layer: "priceAction", geometry: { bands: [], points: [{ t: 1_735_689_600, p: 1.1 }, { t: 1_735_693_200, p: 1.2 }], anchorTimes: [1_735_689_600] } }),
    ];
    const out = toAnnotations(objs, { viewTf: "H1", until: 1_736_000_000, projected: new Set() });
    expect(out.map((a) => a.kind).sort()).toEqual(["level", "line", "marker", "zone"]);
    for (const a of out) {
      const parsed = AnnotationSchema.safeParse(wire(a));
      expect(parsed.success, JSON.stringify(parsed)).toBe(true);
    }
  });
  it("projected objects are faint, badged with source TF, and keep source_tf", () => {
    const o = mkObj({ source_tf: "D" });
    const [a] = toAnnotations([o], { viewTf: "M5", until: o.known_at + 100, projected: new Set([o.id]) });
    expect(a?.emphasis).toBe("faint");
    expect(a?.label).toMatch(/^D · /);
    expect(a?.source_tf).toBe("D");
  });
  it("maps roles to existing tokens (premium_discount for S/D)", () => {
    const [a] = toAnnotations([mkObj({ direction: "bear" })], { viewTf: "H1", until: 9e9, projected: new Set() });
    expect(a?.role).toBe("premium_discount");
    expect(a?.tone).toBe("bear");
  });
});

describe("projection ladder / relevance / caps", () => {
  it("projects only to lower TFs", () => {
    expect(projectsTo("D", "M5")).toBe(true);
    expect(projectsTo("M5", "D")).toBe(false);
    expect(projectsTo("H1", "H1")).toBe(false);
  });
  it("never draws a lower-TF object on a higher TF; projects HTF onto lower, marked projected", () => {
    const low = mkObj({ source_tf: "M5" });
    const high = mkObj({ source_tf: "D", lo: 1.1, hi: 1.101 });
    const r = selectForView(sel({ objects: [low, high], viewTf: "H1" }));
    expect(r.objects.map((o) => o.id)).toEqual([high.id]);
    expect(r.projected.has(high.id)).toBe(true);
  });
  it("relevance drops far projected objects; native stay", () => {
    const far = mkObj({ source_tf: "D", lo: 2, hi: 2.001 });
    expect(isRelevant(far, 1.1, 0.001)).toBe(false);
    expect(selectForView(sel({ objects: [far], viewTf: "M5" })).objects).toEqual([]);
    const native = mkObj({ source_tf: "M5", lo: 2, hi: 2.001 });
    expect(selectForView(sel({ objects: [native] })).objects).toHaveLength(1);
  });
  it("caps: standard 8/layer, advanced 20/layer, minimal 3 total", () => {
    const objs = Array.from({ length: 30 }, () => mkObj({ source_tf: "M5" }));
    expect(selectForView(sel({ objects: objs, complexity: "standard" })).objects).toHaveLength(8);
    expect(selectForView(sel({ objects: objs, complexity: "advanced" })).objects).toHaveLength(20);
    expect(selectForView(sel({ objects: objs, complexity: "minimal" })).objects).toHaveLength(3);
  });
  it("layer maxObjects and visibility apply", () => {
    const objs = Array.from({ length: 5 }, () => mkObj({ source_tf: "M5" }));
    const s = allOn();
    s.supplyDemand.maxObjects = 2;
    expect(selectForView(sel({ objects: objs, settings: s })).objects).toHaveLength(2);
    s.supplyDemand.visible = false;
    expect(selectForView(sel({ objects: objs, settings: s })).objects).toHaveLength(0);
  });
  it("hides mitigated/invalid by default, shows when enabled", () => {
    const o = mkObj({ source_tf: "M5", lifecycle: [{ kind: "invalidated", t: 1, known_at: 1 }] });
    const s = allOn();
    expect(selectForView(sel({ objects: [o], settings: s })).objects).toHaveLength(0);
    s.supplyDemand.showInvalid = true;
    expect(selectForView(sel({ objects: [o], settings: s })).objects).toHaveLength(1);
  });
  it("no object with known_at > asOf reaches the chart", () => {
    const objs = [mkObj({ source_tf: "M5" }), mkObj({ source_tf: "M5" }), mkObj({ source_tf: "M5" })];
    const t = objs[1]!.known_at;
    const r = selectForView(sel({ objects: objs, asOf: t }));
    expect(r.objects.length).toBeGreaterThan(0);
    expect(r.objects.every((o) => o.known_at <= t)).toBe(true);
  });
});

describe("layerStore", () => {
  beforeEach(() => useLayerStore.getState().reset());
  it("defaults to core (3 of 6) and presets only change visibility", () => {
    expect(selectVisibleCount(useLayerStore.getState())).toBe(3);
    useLayerStore.getState().setLayer("fvg", { maxObjects: 4 });
    useLayerStore.getState().applyPreset("all");
    expect(selectVisibleCount(useLayerStore.getState())).toBe(6);
    expect(useLayerStore.getState().settings.fvg.maxObjects).toBe(4);
    expect(PRESETS.map((p) => p.label)).toEqual(["Market Map", "Liquidity", "Price Action", "Execution", "Show all", "Reset to core"]);
  });
  it("manual toggle clears preset; corrupt parse falls back to defaults", () => {
    useLayerStore.getState().applyPreset("execution");
    useLayerStore.getState().toggle("structure");
    expect(useLayerStore.getState().preset).toBeNull();
    expect(parseLayerSettings("junk")).toEqual(defaultSettingsMap());
    expect(parseLayerSettings({ settings: { fvg: { visible: "x", maxObjects: -3 } } }).fvg.maxObjects).toBeNull();
  });
});

describe("useDeskAnnotations", () => {
  beforeEach(() => {
    useLayerStore.getState().applyPreset("all");
    useDeskStore.setState({ complexity: "advanced" });
    useDeskUiStore.setState({ asOf: "latest" });
  });
  const series = [{ tf: "H1" as const, candles: zone.candles }];
  it("returns annotations for the view TF and respects Desk as-of", () => {
    const { result, rerender } = renderHook(() => useDeskAnnotations("EUR_USD", "H1", series));
    const all = result.current;
    expect(all.length).toBeGreaterThan(0);
    const t = zone.candles[20]!.time;
    useDeskUiStore.setState({ asOf: t });
    rerender();
    expect(result.current.every((a) => a.known_at <= t)).toBe(true);
    expect(result.current.length).toBeLessThan(all.length);
  });
});