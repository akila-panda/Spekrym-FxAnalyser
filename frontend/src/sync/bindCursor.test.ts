import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStore } from "zustand/vanilla";
import { cursorInit, type CursorState } from "@/stack/cursorStore";
import { bindCursor, validateCursor, type PresenceLike } from "./bindCursor";
import { createMemoryBus, type MemoryBus } from "./channel";
import { createRemoteGuard, makeEnvelope } from "./protocol";

const presenceOf = (n: number): PresenceLike & { set(n: number): void } => {
  let count = n;
  const ls = new Set<(p: unknown[]) => void>();
  return {
    count: () => count,
    onChange: (fn) => {
      ls.add(fn);
      return () => {
        ls.delete(fn);
      };
    },
    set(v) {
      count = v;
      ls.forEach((f) => f(new Array(v).fill(0)));
    },
  };
};

function mount(bus: MemoryBus, self: string, peers = 1) {
  const store = createStore<CursorState>()(cursorInit);
  const presence = presenceOf(peers);
  const b = bindCursor({ self, transport: bus.connect(self), guard: createRemoteGuard() }, store, presence);
  return { store, presence, b };
}

describe("W5 cursor sync", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("validates payloads", () => {
    expect(validateCursor({ t: 5 })).toEqual({ t: 5 });
    expect(validateCursor({ t: null })).toEqual({ t: null });
    for (const bad of [null, 1, {}, { t: "x" }, { t: NaN }, { t: Infinity }]) expect(validateCursor(bad)).toBeNull();
  });

  it("mirrors a local hover as a source-less remote cursor, debounced", () => {
    const bus = createMemoryBus();
    const a = mount(bus, "w-a");
    const b = mount(bus, "w-b");
    a.store.getState().set(1000, "M5");
    a.store.getState().set(1300, "M5");
    expect(b.store.getState().time).toBeNull();
    vi.advanceTimersByTime(50);
    expect(b.store.getState()).toMatchObject({ time: 1300, source: null });
    expect(bus.log.filter((e) => e.type === "cursor")).toHaveLength(1);
  });

  it("clears immediately when the hover leaves", () => {
    const bus = createMemoryBus();
    const a = mount(bus, "w-a");
    const b = mount(bus, "w-b");
    a.store.getState().set(1000, "M5");
    vi.advanceTimersByTime(50);
    a.store.getState().clear("M5");
    expect(b.store.getState().time).toBeNull();
  });

  it("does not echo remote applies", () => {
    const bus = createMemoryBus();
    const a = mount(bus, "w-a");
    mount(bus, "w-b");
    a.store.getState().set(1000, "M5");
    vi.advanceTimersByTime(100);
    expect(bus.log.filter((e) => e.type === "cursor")).toHaveLength(1);
  });

  it("a local hover wins over a remote cursor", () => {
    const bus = createMemoryBus();
    const b = mount(bus, "w-b");
    b.store.getState().set(2000, "H1");
    bus.connect("w-x").post(makeEnvelope("cursor", "cursor", 0, "w-x", { t: 5 }));
    expect(b.store.getState()).toMatchObject({ time: 2000, source: "H1" });
    bus.connect("w-y").post(makeEnvelope("cursor", "cursor", 0, "w-y", { t: null }));
    expect(b.store.getState().time).toBe(2000);
  });

  it("ignores malformed payloads", () => {
    const bus = createMemoryBus();
    const b = mount(bus, "w-b");
    bus.connect("w-x").post(makeEnvelope("cursor", "cursor", 0, "w-x", { t: "bad" }));
    expect(b.store.getState().time).toBeNull();
  });

  it("does not post without peers, tracks peer count and drops a stale remote cursor when the last peer leaves", () => {
    const bus = createMemoryBus();
    const a = mount(bus, "w-a", 0);
    a.store.getState().set(1000, "M5");
    vi.advanceTimersByTime(100);
    expect(bus.log).toHaveLength(0);
    expect(a.store.getState().peers).toBe(0);
    a.presence.set(1);
    expect(a.store.getState().peers).toBe(1);
    bus.connect("w-x").post(makeEnvelope("cursor", "cursor", 0, "w-x", { t: 5 }));
    a.store.getState().clear("M5");
    bus.connect("w-x").post(makeEnvelope("cursor", "cursor", 0, "w-x", { t: 7 }));
    expect(a.store.getState().time).toBe(7);
    a.presence.set(0);
    expect(a.store.getState().time).toBeNull();
  });
});