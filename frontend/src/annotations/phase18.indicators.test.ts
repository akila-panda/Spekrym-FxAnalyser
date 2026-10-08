import { describe, expect, it } from "vitest";
import { createChartApi } from "@/chart/chartApi";
import { AnnotationSchema, type Annotation } from "@/types/schemas";
import { toSpecs, type SpecContext } from "./toPrimitives";

const T = "2026-03-02T10:00:00Z";
const T2 = "2026-03-02T11:00:00Z";
const ctx: SpecContext = { resolve: (v) => `color(${v})`, pair: "EUR_USD", text: "#fff", bg: "#000", font: "mono" };
const base = { id: "a", role: "filter", tone: "neutral", source_tf: "M15", step: 0, known_at: T };
const mk = (o: Record<string, unknown>): Annotation => AnnotationSchema.parse({ ...base, ...o });

describe("Phase 18 — indicator specs", () => {
  it("emits a series indicator carrying pane, style and warm-up nulls", () => {
    const specs = toSpecs([mk({
      kind: "series", pane: "rsi", style: "line", label: "RSI(14)",
      points: [{ t: T, v: null }, { t: T2, v: 55 }],
    })], ctx);
    expect(specs.indicators).toHaveLength(1);
    const s = specs.indicators[0]!;
    expect(s.paneId).toBe("rsi");
    expect(s.title).toBe("RSI(14)");
    expect(s.data).toEqual([{ time: expect.any(Number), value: null }, { time: expect.any(Number), value: 55 }]);
  });

  it("derives a title from params_used when there is no label", () => {
    const specs = toSpecs([mk({
      kind: "series", pane: "price", style: "line",
      params_used: { length: 20 }, points: [{ t: T, v: 1 }],
    })], ctx);
    expect(specs.indicators[0]!.title).toBe("length=20");
  });

  it("expands a band into three line indicators on one pane", () => {
    const specs = toSpecs([mk({
      kind: "band", pane: "price", label: "BB(20,2)",
      upper: [{ t: T, v: 2 }], mid: [{ t: T, v: 1.5 }], lower: [{ t: T, v: 1 }],
    })], ctx);
    expect(specs.indicators.map((i) => i.id)).toEqual(["a:u", "a:m", "a:l"]);
    expect(specs.indicators.every((i) => i.type === "line" && i.paneId === "price")).toBe(true);
    expect(specs.indicators[1]!.title).toBe("BB(20,2)");
  });

  it("reconciles series through a minimal chart stub (add new pane, remove dropped series)", () => {
    const calls: string[] = [];
    const removed: string[] = [];
    let paneCounter = 0;
    const chart = {
      addPane: () => { const idx = ++paneCounter; return { paneIndex: () => idx }; },
      removePane: (i: number) => calls.push(`removePane:${i}`),
      addSeries: (_def: unknown, opts: { title?: string }, paneIndex?: number) => {
        calls.push(`add:${opts.title}@${paneIndex ?? 0}`);
        return { setData: () => calls.push("setData"), applyOptions: () => {}, __id: opts.title };
      },
      removeSeries: (s: { __id?: string }) => removed.push(s.__id ?? "?"),
      timeScale: () => ({}),
    };
    const api = createChartApi({ chart, series: {} } as never, () => []);

    api.syncIndicators([{ id: "x", paneId: "price", type: "line", color: "#f00", title: "EMA", data: [{ time: 1, value: 1 }] }]);
    api.syncIndicators([{ id: "y", paneId: "rsi", type: "line", color: "#0f0", title: "RSI", data: [{ time: 1, value: 2 }] }]);
    expect(calls).toContain("add:EMA@0");
    expect(calls).toContain("add:RSI@1");
    expect(removed).toContain("EMA"); // x dropped on the second sync
  });
});
