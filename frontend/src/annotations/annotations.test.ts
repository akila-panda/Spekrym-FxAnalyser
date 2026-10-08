import { ChartApi } from "@/chart/chartApi";
import { PANEL_ORDER, TF_SECONDS, type Timeframe } from "@/types/market";
import { AnnotationSchema, type Annotation } from "@/types/schemas";
import { AnnotationManager } from "./AnnotationManager";
import { buildDevSetup } from "./devSetup";
import { hitTest } from "./hitTest";
import { roleGroup, roleVar } from "./roles";
import { DEFAULT_FLOW, shouldShow } from "./routing";
import { styleFor } from "./styleFor";
import { toMarker } from "./toMarkers";
import { toSpecs } from "./toPrimitives";
import { visibleAnnotations } from "./visibility";

const T = "2026-03-02T10:00:00Z";
const mk = (o: Record<string, unknown>): Annotation =>
  AnnotationSchema.parse({ id: "a", role: "liquidity", tone: "neutral", source_tf: "H1", step: 0, known_at: T, ...o });

const KIND_EXTRA: Record<Annotation["kind"], Record<string, unknown>> = {
  level: { t0: T, price: 1.1 },
  zone: { t0: T, t1: T, p_high: 1.2, p_low: 1.1 },
  window: { t0: T, t1: T },
  line: { points: [{ t: T, p: 1 }, { t: T, p: 2 }] },
  polyline: { points: [{ t: T, p: 1 }, { t: T, p: 2 }] },
  marker: { t0: T, price: 1.1 },
  text: { t0: T, price: 1.1, label: "x" },
  trade: { t0: T, t1: T, direction: "long", entry: 1, stop: 0.9, target: 1.2 },
  banded_zone: { t0: T, t1: T, bands: [{ p_high: 1.2, p_low: 1.1, role: "premium_discount" }] },
  fib_zone: { anchor_a: { t: T, p: 1 }, anchor_b: { t: T, p: 2 }, levels: [0.618] },
  bar_highlight: { bars: [T] },
  series: { pane: "price", style: "line", points: [{ t: T, v: 1 }] },
  band: { pane: "price", upper: [{ t: T, v: 2 }], mid: [{ t: T, v: 1.5 }], lower: [{ t: T, v: 1 }] },
};
const kinds = Object.keys(KIND_EXTRA) as Annotation["kind"][];
const of = (kind: Annotation["kind"], o: Record<string, unknown> = {}) => mk({ kind, ...KIND_EXTRA[kind], ...o });
const rank = (t: Timeframe) => TF_SECONDS[t];

describe("shouldShow: default routing for every kind, source and panel", () => {
  for (const kind of kinds) {
    for (const source of PANEL_ORDER) {
      for (const panel of PANEL_ORDER) {
        const flow = DEFAULT_FLOW[kind];
        const expected = flow === "all" ? true : flow === "local" ? panel === source : rank(panel) <= rank(source);
        it(`${kind} from ${source} on ${panel} -> ${expected}`, () => {
          expect(shouldShow(of(kind, { source_tf: source }), panel)).toBe(expected);
        });
      }
    }
  }
  it("an H1 zone appears on H1, M15, M5, M1 but not H4", () => {
    const z = of("zone", { source_tf: "H1" });
    expect(PANEL_ORDER.filter((p) => shouldShow(z, p))).toEqual(["H1", "M15", "M5", "M1"]);
  });
  it("an M1 marker appears only on M1", () => {
    expect(PANEL_ORDER.filter((p) => shouldShow(of("marker", { source_tf: "M1" }), p))).toEqual(["M1"]);
  });
  it("a trade appears on all five", () => {
    expect(PANEL_ORDER.filter((p) => shouldShow(of("trade", { source_tf: "M5" }), p))).toHaveLength(5);
  });
});

describe("shouldShow: overrides", () => {
  it("flow: all, local and down override the kind default", () => {
    expect(shouldShow(of("marker", { source_tf: "M1", flow: "all" }), "H4")).toBe(true);
    expect(shouldShow(of("zone", { source_tf: "H1", flow: "local" }), "M5")).toBe(false);
    expect(shouldShow(of("trade", { source_tf: "H1", flow: "down" }), "H4")).toBe(false);
  });
  it("visible_on is an explicit list and beats flow", () => {
    const a = of("zone", { source_tf: "H1", flow: "all", visible_on: ["M5"] });
    expect(PANEL_ORDER.filter((p) => shouldShow(a, p))).toEqual(["M5"]);
    expect(shouldShow(of("zone", { visible_on: [] }), "H1")).toBe(false);
  });
  it("user overrides: hide wins over show, both beat routing", () => {
    const a = of("marker", { source_tf: "M1" });
    expect(shouldShow(a, "H4", { show: new Set(["a"]) })).toBe(true);
    expect(shouldShow(a, "M1", { hide: new Set(["a"]) })).toBe(false);
    expect(shouldShow(a, "M1", { show: new Set(["a"]), hide: new Set(["a"]) })).toBe(false);
  });
});

describe("visibleAnnotations", () => {
  const steps = [
    { n: 1, label: "one", known_at: 100 },
    { n: 2, label: "two", known_at: 200 },
  ];
  const at = (id: string, step: number, known: number) => ({ ...of("trade", { id, step }), known_at: known }) as Annotation;
  const list = [at("ctx", 0, 500), at("s1", 1, 100), at("s2", 2, 200), at("late", 2, 300)];
  const base = { annotations: list, steps, panelTf: "M5" as Timeframe, hiddenGroups: new Set<string>() };

  it("shows everything when no step is chosen", () => {
    expect(visibleAnnotations({ ...base, step: null }).map((a) => a.id)).toEqual(["ctx", "s1", "s2", "late"]);
  });
  it("steps reveal by known_at, always keeping context", () => {
    expect(visibleAnnotations({ ...base, step: 1 }).map((a) => a.id)).toEqual(["ctx", "s1"]);
    expect(visibleAnnotations({ ...base, step: 2 }).map((a) => a.id)).toEqual(["ctx", "s1", "s2"]);
  });
  it("an unknown step shows everything", () => {
    expect(visibleAnnotations({ ...base, step: 9 })).toHaveLength(4);
  });
  it("hidden role groups are removed; unknown roles group as other", () => {
    const l = [of("level", { id: "x", role: "liquidity" }), of("level", { id: "y", role: "zzz" })];
    expect(visibleAnnotations({ ...base, annotations: l, step: null, hiddenGroups: new Set(["liquidity"]) }).map((a) => a.id)).toEqual(["y"]);
    expect(visibleAnnotations({ ...base, annotations: l, step: null, hiddenGroups: new Set(["other"]) }).map((a) => a.id)).toEqual(["x"]);
  });
  it("an empty setup shows nothing", () => {
    expect(visibleAnnotations({ ...base, annotations: [], steps: [], step: 1 })).toEqual([]);
  });
});

describe("roles and styles", () => {
  it("maps roles to variables, picking by tone where needed", () => {
    expect(roleVar("imbalance", "bull")).toBe("--role-fvg-bull");
    expect(roleVar("imbalance", "bear")).toBe("--role-fvg-bear");
    expect(roleVar("premium_discount", "bear")).toBe("--role-premium");
    expect(roleVar("premium_discount", "bull")).toBe("--role-discount");
    expect(roleVar("order_block", "neutral")).toBe("--role-order-block");
    expect(roleVar("sweep", "neutral")).toBe("--role-sweep");
  });
  it("unknown roles fall back to the tone colour", () => {
    expect(roleVar("mystery", "bull")).toBe("--up");
    expect(roleVar("mystery", "bear")).toBe("--down");
    expect(roleVar("mystery", "neutral")).toBe("--muted");
    expect(roleGroup("mystery")).toBe("other");
    expect(styleFor("mystery", "bull")).toMatchObject({ cssVar: "--up", fillAlpha: 0.1 });
  });
  it("applies the section 2 alphas and line styles", () => {
    expect(styleFor("window", "neutral").fillAlpha).toBe(0.06);
    expect(styleFor("range", "neutral")).toMatchObject({ fillAlpha: 0.1, borderAlpha: 0.7 });
    expect(styleFor("imbalance", "bull")).toMatchObject({ fillAlpha: 0.14, borderAlpha: 0.5, borderDash: [1, 2] });
    expect(styleFor("order_block", "bull")).toMatchObject({ fillAlpha: 0.18, borderAlpha: 0.8 });
    expect(styleFor("premium_discount", "bear")).toMatchObject({ fillAlpha: 0.05, midline: true });
    expect(styleFor("premium_discount", "bull").midline).toBe(false);
    expect(styleFor("liquidity", "neutral").dash).toEqual([4, 3]);
    expect(styleFor("bias", "neutral").lineWidth).toBe(3);
    expect(styleFor("entry", "neutral").lineWidth).toBe(1.5);
  });
});

describe("toSpecs", () => {
  const ctx = { resolve: (v: string) => `c${v}`, pair: "EUR_USD" as const, text: "#fff", bg: "#000", font: "mono" };
  it("returns nothing for an empty setup", () => {
    expect(toSpecs([], ctx)).toEqual({ shapes: [], texts: [], markers: [], indicators: [] });
  });
  it("sends markers to series markers, text to labels, and the rest to shapes", () => {
    const s = toSpecs([of("marker", { id: "m" }), of("text", { id: "t" }), of("zone", { id: "z", label: "FVG" }), of("level", { id: "l", t1: T })], ctx);
    expect(s.markers).toHaveLength(1);
    expect(s.texts.map((t) => t.text)).toEqual(["x", "FVG"]);
    expect(s.shapes.map((x) => x.id)).toEqual(["z", "l"]);
  });
  it("a level with no end extends right and gets an axis label; one with an end does not", () => {
    const [a, b] = toSpecs([of("level", { id: "a" }), of("level", { id: "b", t1: T })], ctx).shapes;
    expect(a).toMatchObject({ opts: { end: "right", priceText: "1.10000" } });
    expect(b).toMatchObject({ opts: { priceText: undefined } });
  });
  it("tints a trade by outcome", () => {
    const win = toSpecs([of("trade", { exit_price: 1.2 })], ctx).shapes[0];
    const loss = toSpecs([of("trade", { exit_price: 0.9 })], ctx).shapes[0];
    const open = toSpecs([of("trade")], ctx).shapes[0];
    expect([win, loss, open].map((x) => (x?.type === "trade" ? x.opts.outcome : null))).toEqual(["win", "loss", "open"]);
  });
  it("maps marker shapes", () => {
    const m = (shape: string) => toMarker(of("marker", { shape }) as never, "#fff");
    expect(m("arrow_up").shape).toBe("arrowUp");
    expect(m("arrow_down").shape).toBe("arrowDown");
    expect(m("circle")).toMatchObject({ shape: "circle", position: "atPriceMiddle", price: 1.1 });
  });
});

describe("AnnotationManager", () => {
  const makeApi = () => {
    const detached: unknown[] = [];
    const attached: unknown[] = [];
    const api = {
      getCandles: () => [],
      attachPrimitive: (p: unknown) => {
        attached.push(p);
        return () => detached.push(p);
      },
      setMarkers: vi.fn(),
      syncIndicators: vi.fn(),
    } as unknown as ChartApi;
    return { api, attached, detached };
  };
  const mgr = (api: ChartApi) => new AnnotationManager(api, "M5", () => "#abc");

  it("attaches once, skips unchanged, updates changed in place, detaches removed", () => {
    const { api, attached, detached } = makeApi();
    const m = mgr(api);
    const zone = of("zone", { id: "z" });
    m.sync([zone, of("level", { id: "l" })], "EUR_USD");
    expect(attached).toHaveLength(2);
    m.sync([zone, of("level", { id: "l" })], "EUR_USD");
    expect(attached).toHaveLength(2);
    m.sync([of("zone", { id: "z", p_high: 1.5 }), of("level", { id: "l" })], "EUR_USD");
    expect(attached).toHaveLength(2);
    m.sync([zone], "EUR_USD");
    expect(detached).toHaveLength(1);
  });
  it("groups all text into one primitive and removes it when empty", () => {
    const { api, attached, detached } = makeApi();
    const m = mgr(api);
    m.sync([of("text", { id: "t1" }), of("text", { id: "t2" })], "EUR_USD");
    expect(attached).toHaveLength(1);
    m.sync([], "EUR_USD");
    expect(detached).toHaveLength(1);
  });
  it("handles an empty setup and disposes cleanly", () => {
    const { api, attached, detached } = makeApi();
    const m = mgr(api);
    m.sync([], "EUR_USD");
    expect(attached).toHaveLength(0);
    m.sync([of("zone", { id: "z" }), of("text", { id: "t" })], "EUR_USD");
    m.dispose();
    expect(detached).toHaveLength(2);
    expect(api.setMarkers).toHaveBeenLastCalledWith([]);
  });
});

describe("hitTest", () => {
  const c = { timeX: (t: number) => (t - 1000) / 10, priceY: (p: number) => 200 - p * 100 };
  const t = (x: number) => new Date((1000 + x * 10) * 1000).toISOString().replace(".000Z", "Z");
  it("finds a level near its line and misses far from it", () => {
    const lvl = of("level", { t0: t(0), price: 1 });
    expect(hitTest([lvl], 50, 101, c, 300)).toBe(lvl);
    expect(hitTest([lvl], 50, 140, c, 300)).toBeNull();
  });
  it("prefers a marker over the zone it sits in", () => {
    const zone = of("zone", { id: "z", t0: t(0), t1: t(100), p_high: 1.5, p_low: 0.5 });
    const mark = of("marker", { id: "m", t0: t(50), price: 1 });
    expect(hitTest([zone, mark], 50, 100, c, 300)).toBe(mark);
    expect(hitTest([zone, mark], 10, 100, c, 300)).toBe(zone);
  });
});

describe("buildDevSetup", () => {
  const bars = Array.from({ length: 20 }, (_, i) => ({ time: 1_800_000_000 + i * 900, open: 1.1, high: 1.102, low: 1.098, close: 1.1 + i * 1e-4, volume: 1 }));
  it("is valid and routes as the gate expects", () => {
    const { annotations, steps } = buildDevSetup(bars);
    expect(steps).toHaveLength(3);
    const on = (id: string) => PANEL_ORDER.filter((p) => shouldShow(annotations.find((a) => a.id === id)!, p));
    expect(on("dev-h1-fvg")).toEqual(["H1", "M15", "M5", "M1"]);
    expect(on("dev-m1-sweep")).toEqual(["M1"]);
    expect(on("dev-trade")).toHaveLength(5);
  });
  it("needs enough bars", () => {
    expect(() => buildDevSetup(bars.slice(0, 5))).toThrow();
  });
});