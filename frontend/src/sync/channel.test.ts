import { createMemoryBus, createTransport, STORAGE_KEY, type StorageEventLike } from "./channel";
import { encodeEnvelope, makeEnvelope, type Envelope } from "./protocol";

class FakeBC {
  static all: FakeBC[] = [];
  name: string;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  closed = false;
  constructor(name: string) {
    this.name = name;
    FakeBC.all.push(this);
  }
  postMessage(data: unknown) {
    for (const b of FakeBC.all) if (b !== this && !b.closed && b.name === this.name) b.onmessage?.({ data });
  }
  close() {
    this.closed = true;
  }
}

beforeEach(() => {
  FakeBC.all = [];
});

describe("W3a broadcast transport", () => {
  it("delivers to peers and drops echoes and garbage", () => {
    const a = createTransport("w-a", { BroadcastChannelCtor: FakeBC });
    const b = createTransport("w-b", { BroadcastChannelCtor: FakeBC });
    expect(a.kind).toBe("broadcast");
    const got: Envelope[] = [];
    b.subscribe((e) => got.push(e));
    const env = makeEnvelope("delta", "view", 1, "w-a", { pair: "EUR_USD" });
    a.post(env);
    expect(got).toEqual([env]);
    FakeBC.all[0]?.postMessage("garbage");
    a.post(makeEnvelope("delta", "view", 2, "w-b", { x: 1 })); // claims to be from b: echo at b
    expect(got).toHaveLength(1);
  });
  it("stops delivering after close", () => {
    const a = createTransport("w-a", { BroadcastChannelCtor: FakeBC });
    const b = createTransport("w-b", { BroadcastChannelCtor: FakeBC });
    const got: Envelope[] = [];
    b.subscribe((e) => got.push(e));
    b.close();
    a.post(makeEnvelope("delta", "view", 1, "w-a", {}));
    expect(got).toHaveLength(0);
  });
});

describe("W3a storage fallback", () => {
  function setup(throwOnSet = false) {
    const writes: Array<[string, string]> = [];
    let handler: ((e: StorageEventLike) => void) | undefined;
    const target = {
      addEventListener: (_t: "storage", fn: (e: StorageEventLike) => void) => {
        handler = fn;
      },
      removeEventListener: () => {
        handler = undefined;
      },
    };
    const storage = {
      setItem: (k: string, v: string) => {
        if (throwOnSet) throw new Error("quota");
        writes.push([k, v]);
      },
    };
    const t = createTransport("w-a", { storage, target });
    return { t, writes, fire: (e: StorageEventLike) => handler?.(e), hasHandler: () => handler !== undefined };
  }

  it("writes unique values so identical messages still fire", () => {
    const { t, writes } = setup();
    expect(t.kind).toBe("storage");
    const env = makeEnvelope("delta", "view", 1, "w-a", { a: 1 });
    t.post(env);
    t.post(env);
    expect(writes).toHaveLength(2);
    expect(writes[0]?.[0]).toBe(STORAGE_KEY);
    expect(writes[0]?.[1]).not.toBe(writes[1]?.[1]);
  });
  it("receives from other windows, ignores other keys, echoes and malformed values", () => {
    const { t, fire } = setup();
    const got: Envelope[] = [];
    t.subscribe((e) => got.push(e));
    const other = makeEnvelope("delta", "view", 1, "w-b", { a: 1 });
    fire({ key: STORAGE_KEY, newValue: `n:1:0|${encodeEnvelope(other)}` });
    expect(got).toEqual([other]);
    fire({ key: "other", newValue: `n|${encodeEnvelope(other)}` });
    fire({ key: STORAGE_KEY, newValue: null });
    fire({ key: STORAGE_KEY, newValue: "no-separator" });
    fire({ key: STORAGE_KEY, newValue: "n|{bad json" });
    fire({ key: STORAGE_KEY, newValue: `n|${encodeEnvelope(makeEnvelope("delta", "view", 2, "w-a", { a: 1 }))}` });
    expect(got).toHaveLength(1);
  });
  it("never throws when storage fails; close detaches", () => {
    const failing = setup(true);
    expect(() => failing.t.post(makeEnvelope("delta", "view", 1, "w-a", {}))).not.toThrow();
    const ok = setup();
    ok.t.close();
    expect(ok.hasHandler()).toBe(false);
  });
});

describe("W3a degraded and memory", () => {
  it("is a silent no-op with no transport available", () => {
    const t = createTransport("w-a", {});
    expect(t.kind).toBe("none");
    expect(() => t.post(makeEnvelope("delta", "view", 1, "w-a", {}))).not.toThrow();
  });
  it("memory bus delivers to others, not the sender, and logs posts", () => {
    const bus = createMemoryBus();
    const a = bus.connect("w-a");
    const b = bus.connect("w-b");
    const ga: Envelope[] = [];
    const gb: Envelope[] = [];
    a.subscribe((e) => ga.push(e));
    b.subscribe((e) => gb.push(e));
    a.post(makeEnvelope("delta", "view", 1, "w-a", { a: 1 }));
    expect(ga).toHaveLength(0);
    expect(gb).toHaveLength(1);
    expect(bus.log).toHaveLength(1);
  });
});