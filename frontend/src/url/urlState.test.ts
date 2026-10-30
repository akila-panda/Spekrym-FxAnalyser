import { describe, expect, it } from "vitest";
import { decodeState, encodeState, type ShareState } from "./urlState";

describe("urlState codec", () => {
  it("round-trips a full state", () => {
    const s: ShareState = {
      pair: "USD_JPY", tz: "local", linked: false, layout: "focus", mode: "review",
      strategy: "orb", from: "2025-01-01", to: "2025-02-01",
      params: { range_minutes: 15, mode: "breakout" },
    };
    expect(decodeState(encodeState(s))).toEqual(s);
  });

  it("encodes linked=true as 1 and false as 0", () => {
    expect(encodeState({ linked: true })).toContain("linked=1");
    expect(encodeState({ linked: false })).toContain("linked=0");
    expect(decodeState("linked=1").linked).toBe(true);
    expect(decodeState("linked=0").linked).toBe(false);
  });

  it("drops unknown pair, timezone, layout and malformed dates", () => {
    const got = decodeState("pair=XXX&tz=mars&layout=spiral&from=2025-13-99&to=nope");
    expect(got).toEqual({});
  });

  it("ignores a leading ? and unknown keys", () => {
    expect(decodeState("?pair=EUR_USD&foo=bar")).toEqual({ pair: "EUR_USD" });
  });

  it("coerces numeric params to numbers and keeps strings", () => {
    const got = decodeState("p.range_minutes=15&p.mode=breakout");
    expect(got.params).toEqual({ range_minutes: 15, mode: "breakout" });
  });

  it("DX10: encodes and validates the mode param", () => {
    expect(encodeState({ mode: "investigate" })).toBe("mode=investigate");
    expect(decodeState("mode=review").mode).toBe("review");
    expect(decodeState("mode=spiral")).toEqual({});
  });

  it("omits absent fields from the query", () => {
    expect(encodeState({})).toBe("");
    expect(encodeState({ pair: "EUR_USD" })).toBe("pair=EUR_USD");
  });
});