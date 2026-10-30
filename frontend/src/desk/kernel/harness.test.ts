import { describe, expect, it } from "vitest";
import { TF_SECONDS, type Candle } from "@/types/market";
import { FIXTURES } from "@/desk/__fixtures__/fixtures";
import { deepCandles } from "@/desk/mock/deepMock";
import type { AnalysisObject } from "@/desk/types/schemas";
import { atr } from "./atr";
import { findDisplacements } from "./displacement";
import { checkNoLookahead, checkObjectsNoLookahead } from "./harness";
import { findSwings } from "./swings";
import { viewAsOf, lifecycleState } from "./viewAsOf";

const ctx = { pair: "EUR_USD", tf: "H1" } as const;
const deep = deepCandles("EUR_USD", "H1").slice(0, 700) as Candle[];
const sets: [string, Candle[]][] = [...FIXTURES.map((f) => [f.name, f.candles] as [string, Candle[]]), ["deep-H1", deep]];

describe("no-lookahead harness: kernel detectors", () => {
  for (const [name, bars] of sets) {
    it(`swings N=3 and N=9 — ${name}`, () => {
      for (const n of [3, 9]) {
        const bad = checkNoLookahead(bars, "H1", { detect: (b) => findSwings(b, "H1", n), knownAt: (s) => s.known_at });
        expect(bad).toEqual([]);
      }
    });
    it(`displacement — ${name}`, () => {
      const bad = checkNoLookahead(bars, "H1", {
        detect: (b) => findDisplacements(b, atr(b), ctx, 1.5, 3),
        knownAt: (d) => d.known_at,
      });
      expect(bad).toEqual([]);
    });
  }
});

describe("harness catches leaks", () => {
  it("flags a swing detector that stamps known_at at the swing bar", () => {
    const bad = checkNoLookahead(deep, "H1", {
      detect: (b) => findSwings(b, "H1", 3).map((s) => ({ ...s, known_at: s.time + TF_SECONDS.H1 })),
      knownAt: (s) => s.known_at,
    });
    expect(bad.length).toBeGreaterThan(0);
  });
});

const obj = (over: Partial<AnalysisObject> = {}): AnalysisObject => ({
  id: "fvg:EUR_USD:H1:100", type: "fvg", layer: "fvg", pair: "EUR_USD", source_tf: "H1",
  geometry: { bands: [{ pHigh: 1.1, pLow: 1.09 }], anchorTimes: [100] },
  t_event: 100, known_at: 200, confirmed_at: 400, lifecycle: [
    { kind: "open", t: 200, known_at: 200 }, { kind: "filled", t: 300, known_at: 350 },
  ],
  provenance: { rulesVersion: "r1", dataKind: "sample", detector: "t", detectorVersion: 1 }, evidence: [], ...over,
});

describe("viewAsOf", () => {
  it("hides unknown objects and folds lifecycle/confirmation", () => {
    expect(viewAsOf([obj()], 199)).toEqual([]);
    const a = viewAsOf([obj()], 300)[0]!;
    expect(a.confirmed_at).toBeNull();
    expect(lifecycleState(a)).toBe("open");
    const b = viewAsOf([obj()], 400)[0]!;
    expect(b.confirmed_at).toBe(400);
    expect(lifecycleState(b)).toBe("filled");
  });
  it("object harness: a causal object detector passes, a leaky one fails", () => {
    const sec = TF_SECONDS.H1;
    const mk = (leak: boolean) => (b: Candle[]): AnalysisObject[] =>
      findSwings(b, "H1", 3).map((s) =>
        obj({ id: `swing:EUR_USD:H1:${s.time}`, type: "swing", layer: "structure", t_event: s.time,
          known_at: leak ? s.time + sec : s.known_at, confirmed_at: null, lifecycle: [] }));
    expect(checkObjectsNoLookahead(deep, "H1", mk(false))).toEqual([]);
    expect(checkObjectsNoLookahead(deep, "H1", mk(true)).length).toBeGreaterThan(0);
  });
});