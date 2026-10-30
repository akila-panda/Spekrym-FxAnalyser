import { createStore } from "zustand/vanilla";
import { bindStore } from "./bindStore";
import { pickView, validateView, type ViewFields } from "./bindView";
import { createMemoryBus } from "./channel";
import { createFakeLocks } from "./fakeLocks";
import { createLeader } from "./leader";
import { createRemoteGuard, makeHello } from "./protocol";
import { createRevisions } from "./revision";

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

describe("W3b leader", () => {
  it("first window leads; the next takes over when it disposes", async () => {
    const locks = createFakeLocks();
    const a = createLeader(locks);
    const b = createLeader(locks);
    await tick();
    expect(a.isLeader()).toBe(true);
    expect(b.isLeader()).toBe(false);
    a.dispose();
    await tick();
    expect(a.isLeader()).toBe(false);
    expect(b.isLeader()).toBe(true);
  });
  it("a disposed waiter never takes the lock", async () => {
    const locks = createFakeLocks();
    const a = createLeader(locks);
    const b = createLeader(locks);
    b.dispose();
    a.dispose();
    await tick();
    expect(b.isLeader()).toBe(false);
    expect(locks.heldNames()).toEqual([]);
  });
  it("without Web Locks every window counts as leader", () => {
    expect(createLeader(null).isLeader()).toBe(true);
  });
});

describe("W3b hello is answered by the leader only", () => {
  const init = (): ViewFields => ({ pair: "EUR_USD", asOf: null, timezone: "utc", linked: true });
  function mount(bus: ReturnType<typeof createMemoryBus>, self: string, lead: boolean) {
    const store = createStore<ViewFields>()(() => init());
    bindStore<ViewFields, ViewFields>({
      slice: "view", store, pick: pickView, validate: validateView, toPatch: (p) => p,
      transport: bus.connect(self), self, revisions: createRevisions(self), guard: createRemoteGuard(),
      isLeader: () => lead,
    });
    return store;
  }
  it("posts exactly one state reply", () => {
    const bus = createMemoryBus();
    const a = mount(bus, "w-a", false);
    const b = mount(bus, "w-b", true);
    a.setState({ pair: "GBP_USD" });
    expect(b.getState().pair).toBe("GBP_USD");
    const joiner = bus.connect("w-c");
    const store = createStore<ViewFields>()(() => init());
    bindStore<ViewFields, ViewFields>({
      slice: "view", store, pick: pickView, validate: validateView, toPatch: (p) => p,
      transport: joiner, self: "w-c", revisions: createRevisions("w-c"), guard: createRemoteGuard(),
    });
    joiner.post(makeHello("w-c"));
    expect(bus.log.filter((e) => e.type === "state")).toHaveLength(1);
    expect(store.getState().pair).toBe("GBP_USD");
  });
});