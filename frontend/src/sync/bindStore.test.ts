import { createStore } from "zustand/vanilla";
import { bindStore } from "./bindStore";
import { pickView, validateView, type ViewFields } from "./bindView";
import { createMemoryBus, type MemoryBus } from "./channel";
import { createRemoteGuard, makeEnvelope, makeHello } from "./protocol";
import { createRevisions } from "./revision";

type S = ViewFields & { extra: number };
const base = (): S => ({ pair: "EUR_USD", asOf: null, timezone: "utc", linked: true, extra: 0 });

function mount(bus: MemoryBus, self: string, init: Partial<S> = {}) {
  const store = createStore<S>()(() => ({ ...base(), ...init }));
  const transport = bus.connect(self);
  const revisions = createRevisions(self);
  const binding = bindStore<S, ViewFields>({
    slice: "view",
    store,
    pick: pickView,
    validate: validateView,
    toPatch: (p) => p,
    transport,
    self,
    revisions,
    guard: createRemoteGuard(),
  });
  return { store, transport, revisions, binding };
}

const goodPayload = (pair: ViewFields["pair"]): ViewFields => ({ pair, asOf: null, timezone: "utc", linked: true });

describe("W3a bindStore (view slice)", () => {
  it("mirrors a local change to the peer without echoing", () => {
    const bus = createMemoryBus();
    const a = mount(bus, "w-a");
    const b = mount(bus, "w-b");
    a.store.setState({ pair: "GBP_USD", linked: false, timezone: "local" });
    expect(b.store.getState()).toMatchObject({ pair: "GBP_USD", linked: false, timezone: "local" });
    expect(bus.log).toHaveLength(1);
    expect(b.revisions.stamp("view")).toEqual(a.revisions.stamp("view"));
  });
  it("mirrors both ways", () => {
    const bus = createMemoryBus();
    const a = mount(bus, "w-a");
    const b = mount(bus, "w-b");
    a.store.setState({ pair: "GBP_USD" });
    b.store.setState({ asOf: 1700000000 });
    expect(a.store.getState().asOf).toBe(1700000000);
    expect(b.store.getState().pair).toBe("GBP_USD");
    expect(bus.log).toHaveLength(2);
  });
  it("ignores fields outside the slice", () => {
    const bus = createMemoryBus();
    const a = mount(bus, "w-a");
    const b = mount(bus, "w-b");
    a.store.setState({ extra: 5 });
    expect(bus.log).toHaveLength(0);
    expect(b.store.getState().extra).toBe(0);
  });
  it("ignores invalid payloads without recording a revision", () => {
    const bus = createMemoryBus();
    const b = mount(bus, "w-b");
    const rogue = bus.connect("w-x");
    rogue.post(makeEnvelope("delta", "view", 5, "w-x", { ...goodPayload("EUR_USD"), pair: "NOPE" }));
    rogue.post(makeEnvelope("delta", "view", 6, "w-x", { pair: "GBP_USD" }));
    expect(b.store.getState().pair).toBe("EUR_USD");
    expect(b.revisions.stamp("view")).toBeUndefined();
  });
  it("ignores stale revisions", () => {
    const bus = createMemoryBus();
    const a = mount(bus, "w-a");
    const b = mount(bus, "w-b");
    a.store.setState({ pair: "GBP_USD" });
    a.store.setState({ pair: "USD_JPY" });
    bus.connect("w-x").post(makeEnvelope("delta", "view", 1, "w-x", goodPayload("AUD_USD")));
    expect(b.store.getState().pair).toBe("USD_JPY");
  });
  it("syncs a late joiner via hello", () => {
    const bus = createMemoryBus();
    const a = mount(bus, "w-a");
    a.store.setState({ pair: "GBP_USD", linked: false });
    const c = mount(bus, "w-c");
    c.transport.post(makeHello("w-c"));
    expect(c.store.getState()).toMatchObject({ pair: "GBP_USD", linked: false });
    expect(c.revisions.stamp("view")).toEqual(a.revisions.stamp("view"));
  });
  it("lets a late joiner's later changes win after the snapshot", () => {
    const bus = createMemoryBus();
    const a = mount(bus, "w-a");
    a.store.setState({ pair: "GBP_USD" });
    const c = mount(bus, "w-c");
    c.transport.post(makeHello("w-c"));
    c.store.setState({ pair: "AUD_USD" });
    expect(a.store.getState().pair).toBe("AUD_USD");
  });
  it("untouched peers do not answer hello", () => {
    const bus = createMemoryBus();
    mount(bus, "w-a");
    const c = mount(bus, "w-c", { pair: "AUD_USD" });
    c.transport.post(makeHello("w-c"));
    expect(c.store.getState().pair).toBe("AUD_USD");
    expect(bus.log).toHaveLength(1);
  });
  it("stops mirroring after dispose", () => {
    const bus = createMemoryBus();
    const a = mount(bus, "w-a");
    const b = mount(bus, "w-b");
    b.binding.dispose();
    a.store.setState({ pair: "GBP_USD" });
    expect(b.store.getState().pair).toBe("EUR_USD");
  });
});