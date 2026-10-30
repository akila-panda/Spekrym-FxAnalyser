import { createMemoryBus } from "./channel";
import { makeEnvelope, parseEnvelope } from "./protocol";
import { createPresence, validatePresence } from "./presence";

describe("W3b presence envelope", () => {
  it("parses presence only on slice `all`", () => {
    expect(parseEnvelope(makeEnvelope("presence", "all", 0, "w-a", { role: "main" }))).not.toBeNull();
    expect(parseEnvelope(makeEnvelope("presence", "view", 0, "w-a", { role: "main" }))).toBeNull();
    expect(parseEnvelope(makeEnvelope("presence", "all", 0, "w-a", null))).toBeNull();
  });
  it("validates payloads", () => {
    expect(validatePresence({ role: "charts" })).toEqual({ role: "charts" });
    expect(validatePresence({ role: "charts", bye: true })).toEqual({ role: "charts", bye: true });
    for (const bad of [null, 1, {}, { role: "" }, { role: "x".repeat(33) }, { role: "a", bye: "y" }]) {
      expect(validatePresence(bad)).toBeNull();
    }
  });
});

describe("W3b presence heartbeat", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function pair() {
    const bus = createMemoryBus();
    const ta = bus.connect("w-a");
    const tb = bus.connect("w-b");
    const a = createPresence({ self: "w-a", role: "main", transport: ta });
    const b = createPresence({ self: "w-b", role: "charts", transport: tb });
    return { a, b, ta, tb };
  }

  it("discovers peers in both directions", () => {
    const { a, b } = pair();
    a.start();
    b.start();
    expect(a.peers()).toMatchObject([{ origin: "w-b", role: "charts" }]);
    expect(b.peers()).toMatchObject([{ origin: "w-a", role: "main" }]);
    expect(a.count()).toBe(1);
  });
  it("stays alive while beats keep coming", () => {
    const { a, b } = pair();
    a.start();
    b.start();
    vi.advanceTimersByTime(60000);
    expect(a.count()).toBe(1);
    expect(b.count()).toBe(1);
  });
  it("drops a crashed peer after the ttl and reports it", () => {
    const { a, b, tb } = pair();
    const left: string[] = [];
    a.onLeave((o) => left.push(o));
    a.start();
    b.start();
    tb.close();
    vi.advanceTimersByTime(9000);
    expect(a.count()).toBe(1);
    vi.advanceTimersByTime(4000);
    expect(a.count()).toBe(0);
    expect(left).toEqual(["w-b"]);
  });
  it("drops a peer immediately on a clean stop", () => {
    const { a, b } = pair();
    const left: string[] = [];
    a.onLeave((o) => left.push(o));
    a.start();
    b.start();
    b.stop();
    expect(a.count()).toBe(0);
    expect(left).toEqual(["w-b"]);
  });
  it("notifies change listeners and can unsubscribe", () => {
    const { a, b } = pair();
    const counts: number[] = [];
    const off = a.onChange((p) => counts.push(p.length));
    a.start();
    b.start();
    off();
    b.stop();
    expect(counts).toEqual([1]);
  });
});