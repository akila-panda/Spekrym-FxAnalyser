import type { PanelScan } from "@/scan/scanStore";
import { PANEL_ORDER, type Timeframe } from "@/types/market";
import { createRunnerTracker, orphanPatch } from "./scanOrphans";

const status = (over: Partial<Record<Timeframe, string>> = {}) =>
  Object.fromEntries(PANEL_ORDER.map((tf) => [tf, { status: over[tf] ?? "idle" }])) as Record<Timeframe, { status: string }>;

const idle = (): PanelScan => ({ status: "idle", stale: false });
const panels = (over: Partial<Record<Timeframe, PanelScan>> = {}) =>
  Object.fromEntries(PANEL_ORDER.map((tf) => [tf, over[tf] ?? idle()])) as Record<Timeframe, PanelScan>;

describe("W3b runner tracker", () => {
  it("attributes running to the window that started it and keeps it", () => {
    const t = createRunnerTracker();
    t.observe("w-b", status({ M5: "running" }));
    t.observe("w-c", status({ M5: "running" }));
    expect(t.orphansOf("w-b")).toEqual(["M5"]);
    expect(t.orphansOf("w-c")).toEqual([]);
  });
  it("clears when the chart stops running", () => {
    const t = createRunnerTracker();
    t.observe("w-b", status({ M5: "running" }));
    t.observe("w-b", status({ M5: "done" }));
    expect(t.orphansOf("w-b")).toEqual([]);
  });
});

describe("W3b orphanPatch", () => {
  it("idles a result-less panel and stales one with a result", () => {
    const withResult = { status: "running", stale: false, result: { setups: [], summary: { n_valid: 0 } } } as unknown as PanelScan;
    const out = orphanPatch(panels({ M5: { status: "running", stale: false }, H1: withResult }), ["M5", "H1"], () => false);
    expect(out?.M5).toEqual({ status: "idle", stale: false });
    expect(out?.H1).toMatchObject({ status: "done", stale: true });
  });
  it("skips local scans and non-running panels; null when unchanged", () => {
    const p = panels({ M5: { status: "running", stale: false } });
    expect(orphanPatch(p, ["M5"], () => true)).toBeNull();
    expect(orphanPatch(p, ["H1"], () => false)).toBeNull();
  });
});