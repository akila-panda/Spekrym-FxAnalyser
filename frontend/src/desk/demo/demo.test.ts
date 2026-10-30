import { describe, expect, it } from "vitest";
import { parseRole } from "@/window/role";
import { composeCanvas } from "@/desk/canvas/pipeline";
import { PAIR_META } from "@/types/market";
import { DEMO_PAIR, demoCandles } from "./demoCandles";
import { demoObjects } from "./demoObjects";

describe("DEMO candles", () => {
  it("are deterministic, non-empty, ascending and fewer at H1 than M1", () => {
    const a = demoCandles();
    const b = demoCandles();
    expect(a.length).toBeGreaterThan(50);
    expect(a).toBe(b); // cached, same reference
    for (let i = 1; i < a.length; i++) expect(a[i]!.time).toBeGreaterThan(a[i - 1]!.time);
    expect(demoCandles(DEMO_PAIR, "M1").length).toBeGreaterThan(demoCandles(DEMO_PAIR, "H1").length);
  });
});

describe("DEMO objects", () => {
  it("land on real price/time and are causal (known_at >= t_event)", () => {
    const cs = demoCandles();
    const lo = Math.min(...cs.map((c) => c.low));
    const hi = Math.max(...cs.map((c) => c.high));
    const objs = demoObjects();
    expect(objs.map((o) => o.type).sort()).toEqual(["sd_zone", "sr_level", "sweep"]);
    for (const o of objs) {
      expect(o.known_at).toBeGreaterThanOrEqual(o.t_event);
      for (const b of o.geometry.bands) {
        expect(b.pLow).toBeGreaterThanOrEqual(lo - PAIR_META[DEMO_PAIR].pip);
        expect(b.pHigh).toBeLessThanOrEqual(hi + PAIR_META[DEMO_PAIR].pip);
      }
    }
  });

  it("compose into canvas overlays (the pipeline works on demo data)", () => {
    const c = composeCanvas({ objects: demoObjects() });
    expect(c.overlays.length).toBeGreaterThan(0);
  });
});

describe("DEMO role", () => {
  it("?window=demo parses to the demo role", () => {
    expect(parseRole("?window=demo")).toEqual({ kind: "demo" });
  });
});
