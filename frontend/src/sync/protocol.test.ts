import {
  PROTOCOL_VERSION, createRemoteGuard, encodeEnvelope, isEcho, makeEnvelope, makeHello, makeOrigin,
  parseEnvelope, shouldBroadcast,
} from "./protocol";

describe("W2 encode/decode", () => {
  it("round-trips every message type", () => {
    const list = [
      makeHello("w-a"),
      makeEnvelope("state", "view", 3, "w-a", { pair: "EUR_USD" }),
      makeEnvelope("delta", "scan", 7, "w-b", { strategyId: "x" }),
      makeEnvelope("cursor", "cursor", 1, "w-c", { t: 1700000000 }),
    ];
    for (const env of list) expect(parseEnvelope(encodeEnvelope(env))).toEqual(env);
  });
  it("accepts an already-cloned object", () => {
    const env = makeEnvelope("delta", "view", 1, "w-a", { linked: false });
    expect(parseEnvelope(env)).toEqual(env);
  });
  it("normalises an undefined payload to null", () => {
    expect(makeHello("w-a").payload).toBeNull();
  });
  it("rejects malformed input without throwing", () => {
    const ok = makeEnvelope("delta", "view", 1, "w-a", { a: 1 });
    const bad: unknown[] = [
      "not json", "null", 42, [], null, undefined,
      { ...ok, protocolVersion: PROTOCOL_VERSION + 1 },
      { ...ok, type: "nope" },
      { ...ok, slice: "nope" },
      { ...ok, revision: -1 },
      { ...ok, revision: 1.5 },
      { ...ok, revision: "1" },
      { ...ok, origin: "" },
      { ...ok, origin: "x".repeat(65) },
      { ...ok, payload: null },
      { protocolVersion: PROTOCOL_VERSION, type: "delta", slice: "view", revision: 1, origin: "w-a" },
      { ...ok, type: "cursor" },
      { ...ok, slice: "cursor" },
      { ...ok, slice: "all" },
    ];
    for (const b of bad) expect(parseEnvelope(b)).toBeNull();
  });
});

describe("W2 echo and remote guard", () => {
  it("ignores own echoes", () => {
    const env = makeEnvelope("delta", "view", 1, "w-a", {});
    expect(isEcho(env, "w-a")).toBe(true);
    expect(isEcho(env, "w-b")).toBe(false);
  });
  it("tags mutations and broadcasts only LOCAL", () => {
    const g = createRemoteGuard();
    expect(g.tag()).toBe("LOCAL");
    g.run(() => {
      expect(g.active).toBe(true);
      expect(g.tag()).toBe("REMOTE");
      expect(g.tag(true)).toBe("DERIVED");
    });
    expect(g.active).toBe(false);
    expect(shouldBroadcast("LOCAL")).toBe(true);
    expect(shouldBroadcast("REMOTE")).toBe(false);
    expect(shouldBroadcast("DERIVED")).toBe(false);
  });
  it("is re-entrant and restores after a throw", () => {
    const g = createRemoteGuard();
    g.run(() => {
      g.run(() => undefined);
      expect(g.active).toBe(true);
    });
    expect(() => g.run(() => { throw new Error("x"); })).toThrow("x");
    expect(g.active).toBe(false);
  });
  it("returns the callback result", () => {
    expect(createRemoteGuard().run(() => 5)).toBe(5);
  });
});

describe("W2 origin", () => {
  it("is deterministic for a fixed rand and always prefixed", () => {
    expect(makeOrigin(() => 0)).toBe("w-000000000000");
    expect(makeOrigin(() => 0.5)).toBe(makeOrigin(() => 0.5));
    expect(makeOrigin()).toMatch(/^w-[0-9a-z]{12}$/);
  });
});