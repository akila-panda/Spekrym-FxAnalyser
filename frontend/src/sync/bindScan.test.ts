import { createStore } from "zustand/vanilla";
import { PANEL_ORDER, type Timeframe } from "@/types/market";
import type { PanelScan } from "@/scan/scanStore";
import { bindAnnotation, bindOverrides, type StepFields, type TradeFields } from "./bindOther";
import { bindScanInputs, bindScanResults, type ScanInputState, type ScanResultsFields } from "./bindScan";
import { createMemoryBus, type MemoryBus } from "./channel";
import { createRemoteGuard, makeEnvelope } from "./protocol";
import { createRevisions } from "./revision";

const ctxFor = (bus: MemoryBus, self: string) => ({
  self, transport: bus.connect(self), revisions: createRevisions(self), guard: createRemoteGuard(),
});

const def = {
  id: "s1", name: "S", description: "", supported_timeframes: ["M5"], context_timeframes: [],
  display_tz: "UTC", params: [],
};
const range = { from: "2026-01-01", to: "2026-01-05" };

describe("W3b scan inputs", () => {
  const mount = (bus: MemoryBus, self: string) => {
    const store = createStore<ScanInputState>()(() => ({
      strategies: [], catalog: "idle", strategyId: null, params: {}, range: null, active: null, inputsVersion: 0,
    }));
    bindScanInputs(ctxFor(bus, self), store);
    return store;
  };

  it("mirrors strategy, params and range, marks the catalog ready and bumps inputsVersion", () => {
    const bus = createMemoryBus();
    const a = mount(bus, "w-a");
    const b = mount(bus, "w-b");
    a.setState({ strategies: [def] as never, strategyId: "s1", params: { x: 1 }, range });
    expect(b.getState()).toMatchObject({ strategyId: "s1", params: { x: 1 }, range, catalog: "ready", inputsVersion: 1 });
    expect(b.getState().strategies).toHaveLength(1);
  });
  it("mirrors the active setup without cancelling scans", () => {
    const bus = createMemoryBus();
    const a = mount(bus, "w-a");
    const b = mount(bus, "w-b");
    a.setState({ strategies: [def] as never, strategyId: "s1" });
    a.setState({ active: { tf: "M5", id: "u1" } });
    expect(b.getState().active).toEqual({ tf: "M5", id: "u1" });
    expect(b.getState().inputsVersion).toBe(1);
  });
  it("does not echo remote applies", () => {
    const bus = createMemoryBus();
    const a = mount(bus, "w-a");
    mount(bus, "w-b");
    a.setState({ strategyId: "s1", strategies: [def] as never });
    expect(bus.log).toHaveLength(1);
  });
  it("rejects malformed payloads", () => {
    const bus = createMemoryBus();
    const b = mount(bus, "w-b");
    const rogue = bus.connect("w-x");
    const ok = { strategies: [], strategyId: "s1", params: {}, range: null, active: null };
    for (const bad of [
      { ...ok, range: { from: "nope", to: "2026-01-05" } },
      { ...ok, params: { x: { nested: 1 } } },
      { ...ok, active: { tf: "X9", id: "u" } },
      { ...ok, strategies: [{ id: "" }] },
      { ...ok, strategyId: 5 },
    ]) rogue.post(makeEnvelope("delta", "scan", 9, "w-x", bad));
    expect(b.getState().strategyId).toBeNull();
    expect(b.getState().inputsVersion).toBe(0);
  });
});

describe("W3b scan results", () => {
  const idle = (): PanelScan => ({ status: "idle", stale: false });
  const panels = (over: Partial<Record<Timeframe, PanelScan>> = {}) =>
    Object.fromEntries(PANEL_ORDER.map((tf) => [tf, over[tf] ?? idle()])) as Record<Timeframe, PanelScan>;
  const mount = (bus: MemoryBus, self: string) => {
    const store = createStore<ScanResultsFields>()(() => ({ panels: panels() }));
    bindScanResults(ctxFor(bus, self), store);
    return store;
  };

  it("mirrors running and finished panels", () => {
    const bus = createMemoryBus();
    const a = mount(bus, "w-a");
    const b = mount(bus, "w-b");
    a.setState({ panels: panels({ M5: { status: "running", stale: false } }) });
    expect(b.getState().panels.M5.status).toBe("running");
    const result = { setups: [], summary: { n_valid: 0 } } as unknown as PanelScan["result"];
    a.setState({ panels: panels({ M5: { status: "done", stale: false, result } }) });
    expect(b.getState().panels.M5.result).toEqual(result);
  });
  it("rejects bad status, missing charts and malformed results", () => {
    const bus = createMemoryBus();
    const b = mount(bus, "w-b");
    const rogue = bus.connect("w-x");
    const good = panels();
    rogue.post(makeEnvelope("delta", "scanResults", 5, "w-x", { panels: { ...good, M5: { status: "bogus", stale: false } } }));
    rogue.post(makeEnvelope("delta", "scanResults", 6, "w-x", { panels: { M5: good.M5 } }));
    rogue.post(makeEnvelope("delta", "scanResults", 7, "w-x", { panels: { ...good, M5: { status: "done", stale: false, result: { setups: 1 } } } }));
    expect(b.getState().panels.M5.status).toBe("idle");
  });
});

describe("W3b annotation step and overrides", () => {
  it("mirrors the step and rejects invalid values", () => {
    const bus = createMemoryBus();
    const mk = (self: string) => {
      const s = createStore<StepFields>()(() => ({ step: null }));
      bindAnnotation(ctxFor(bus, self), s);
      return s;
    };
    const a = mk("w-a");
    const b = mk("w-b");
    a.setState({ step: 3 });
    expect(b.getState().step).toBe(3);
    const rogue = bus.connect("w-x");
    rogue.post(makeEnvelope("delta", "annotation", 50, "w-x", { step: 0 }));
    rogue.post(makeEnvelope("delta", "annotation", 51, "w-x", { step: 1.5 }));
    expect(b.getState().step).toBe(3);
    a.setState({ step: null });
    expect(b.getState().step).toBeNull();
  });
  it("mirrors trade overrides and rejects invalid ones", () => {
    const bus = createMemoryBus();
    const mk = (self: string) => {
      const s = createStore<TradeFields>()(() => ({ trades: {} }));
      bindOverrides(ctxFor(bus, self), s);
      return s;
    };
    const a = mk("w-a");
    const b = mk("w-b");
    a.setState({ trades: { t1: { entry: 1.1, stop: 1.09 } } });
    expect(b.getState().trades).toEqual({ t1: { entry: 1.1, stop: 1.09 } });
    bus.connect("w-x").post(makeEnvelope("delta", "overrides", 50, "w-x", { trades: { t1: { entry: "x" } } }));
    expect(b.getState().trades.t1?.entry).toBe(1.1);
    a.setState({ trades: {} });
    expect(b.getState().trades).toEqual({});
  });
});