import { describe, expect, it } from "vitest";
import { DeskCapabilitiesSchema, PositioningSchema, SessionInfoSchema } from "./deskSource";
import { createMockDeskSource } from "./mockDeskSource";
import { createDeskSource } from "./deskSourceFactory";

const NOW = 1_746_828_000;

describe("mock DeskSource", () => {
  it("labels every Sourced payload 'sample'", async () => {
    const s = createMockDeskSource({ now: NOW });
    expect((await s.capabilities()).provenance.kind).toBe("sample");
    expect((await s.getEvents({ from: NOW - 86400, to: NOW })).provenance.kind).toBe("sample");
    expect((await s.getSessions("EUR_USD", "2025-05-09")).provenance.kind).toBe("sample");
    expect((await s.getPositioning("EUR_USD")).provenance.kind).toBe("sample");
  });

  it("payloads parse against their schemas", async () => {
    const s = createMockDeskSource({ now: NOW });
    const caps = (await s.capabilities()).data;
    const sess = (await s.getSessions("EUR_USD", "2025-05-09")).data;
    const pos = (await s.getPositioning("EUR_USD")).data;
    expect(() => DeskCapabilitiesSchema.parse(caps)).not.toThrow();
    expect(() => SessionInfoSchema.parse(sess)).not.toThrow();
    expect(() => PositioningSchema.parse(pos)).not.toThrow();
  });

  it("getCandles returns `limit` ascending candles", async () => {
    const c = await createMockDeskSource({ now: NOW }).getCandles({ pair: "EUR_USD", tf: "H1", limit: 5 });
    expect(c).toHaveLength(5);
    expect(c[0]!.time).toBeLessThan(c[4]!.time);
  });

  it("missing scenario yields null positioning, no events, no candles", async () => {
    const s = createMockDeskSource({ now: NOW, scenario: "missing" });
    expect((await s.getPositioning("EUR_USD")).data).toBeNull();
    expect((await s.getEvents({ from: NOW - 1, to: NOW })).data).toEqual([]);
    expect(await s.getCandles({ pair: "EUR_USD", tf: "H1", limit: 5 })).toEqual([]);
    expect((await s.capabilities()).data.calendar).toBe("absent");
  });

  it("stale scenario flags provenance.stale and an older asOf", async () => {
    const p = (await createMockDeskSource({ now: NOW, scenario: "stale" }).capabilities()).provenance;
    expect(p.stale).toBe(true);
    expect(p.asOf).toBeLessThan(NOW);
  });

  it("factory defaults to a mock, sample source", async () => {
    const s = createDeskSource({});
    expect(s.kind).toBe("mock");
    expect((await s.capabilities()).provenance.kind).toBe("sample");
  });
});
