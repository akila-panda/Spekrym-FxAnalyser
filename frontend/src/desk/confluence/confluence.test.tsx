import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { mkObj } from "@/desk/__fixtures__/objects";
import { buildRelations, detectAll } from "@/desk/detect";
import { useAnalysisStore } from "@/desk/detect/analysisStore";
import { describeObject } from "@/desk/evidence/describe";
import { viewAsOf } from "@/desk/kernel/viewAsOf";
import { deepCandles, DEEP_NOW } from "@/desk/mock/deepMock";
import { useDeskUiStore } from "@/desk/workspace/deskUiStore";
import { defaultWidgets } from "@/desk/workspace/widgetRegistry";
import { buildConfluence } from "./confluence";
import { ConfluenceBody } from "./ConfluenceBody";

const rep = (os: ReturnType<typeof mkObj>[]) => buildConfluence(os, buildRelations(os));

describe("buildConfluence", () => {
  it("builds a multi-timeframe area from independent overlapping objects", () => {
    const d = mkObj({ type: "sr_level", layer: "levels", source_tf: "D", lo: 1.1, hi: 1.102 });
    const h = mkObj({ type: "fvg", layer: "fvg", source_tf: "H1", direction: "bull", lo: 1.101, hi: 1.1015 });
    const r = rep([d, h]);
    expect(r.areas).toHaveLength(1);
    expect(r.areas[0]).toMatchObject({ tfs: ["D", "H1"], independent: 2, direction: "bull" });
    expect(r.byObject[h.id]?.supports.some((f) => f.id === `mtf:${d.id}`)).toBe(true);
    expect(r.byObject[h.id]?.independent).toBe(1);
  });

  it("de-dupes by origin_id: objects sharing an origin never form an area alone", () => {
    const a = mkObj({ source_tf: "H4", origin_id: "disp:x", lo: 1.1, hi: 1.102 });
    const b = mkObj({ type: "fvg", layer: "fvg", source_tf: "H1", origin_id: "disp:x", direction: "bull", lo: 1.101, hi: 1.1015 });
    const r = rep([a, b]);
    expect(r.areas).toEqual([]);
    expect(r.byObject[a.id]?.sharedOrigin).toBe(1);
  });

  it("same-timeframe overlap is not a multi-timeframe area", () => {
    expect(rep([mkObj({ lo: 1.1, hi: 1.102 }), mkObj({ lo: 1.101, hi: 1.103 })]).areas).toEqual([]);
  });

  it("contradictions are first-class and recorded as opposing factors", () => {
    const sup = mkObj({ source_tf: "D", direction: "bear", lo: 1.1, hi: 1.103 });
    const fvg = mkObj({ type: "fvg", layer: "fvg", source_tf: "H1", direction: "bull", lo: 1.101, hi: 1.102 });
    const r = rep([sup, fvg]);
    expect(r.contradictions).toHaveLength(1);
    expect(r.byObject[fvg.id]?.opposes.some((f) => f.id === `opp:${sup.id}`)).toBe(true);
    expect(r.byObject[fvg.id]?.supports.some((f) => f.id.startsWith("mtf:"))).toBe(false);
    expect(r.areas[0]?.direction).toBeUndefined();
  });

  it("spent objects are excluded; missing HTF context is explicit, not silent", () => {
    const d = mkObj({ source_tf: "D", direction: "bull", lo: 1.1, hi: 1.103, lifecycle: [{ kind: "invalidated", t: 9, known_at: 9 }] });
    const h = mkObj({ type: "fvg", layer: "fvg", source_tf: "H1", direction: "bull", lo: 1.101, hi: 1.102 });
    const r = rep([d, h]);
    expect(r.areas).toEqual([]);
    expect(r.byObject[h.id]?.unavailable.map((f) => f.id)).toContain("mtf:none");
    expect(rep([h]).byObject[h.id]?.unavailable[0]?.label).toBe("No higher-timeframe objects in view");
  });

  it("area known_at is the latest member known_at", () => {
    const d = mkObj({ type: "sr_level", layer: "levels", source_tf: "D", lo: 1.1, hi: 1.102 });
    const h = mkObj({ type: "fvg", layer: "fvg", source_tf: "H1", direction: "bull", lo: 1.101, hi: 1.1015 });
    expect(rep([d, h]).areas[0]?.known_at).toBe(Math.max(d.known_at, h.known_at));
  });
});

describe("no lookahead", () => {
  it("confluence over viewAsOf(full, t) equals confluence over detect(prefix t) (D + H4 + H1)", () => {
    const tfs = ["D", "H4", "H1"] as const;
    const run = (asOf: number) => tfs.flatMap((tf) => {
      const c = deepCandles("EUR_USD", tf);
      return detectAll({ candles: c, pair: "EUR_USD", tf, asOf, dataKind: "sample", dataVersion: `${c.length}` }).objects;
    });
    const full = run(Infinity);
    for (const k of [0.4, 0.7, 0.95]) {
      const t = Math.floor(DEEP_NOW - (1 - k) * 60 * 86400);
      const a = rep(viewAsOf(full, t));
      const b = rep(run(t));
      expect(a.areas.every((x) => x.known_at <= t)).toBe(true);
      expect(a.areas.map((x) => x.memberIds.join()).sort()).toEqual(b.areas.map((x) => x.memberIds.join()).sort());
      expect(a.contradictions.map((x) => x.id).sort()).toEqual(b.contradictions.map((x) => x.id).sort());
    }
  }, 60000);
});

describe("evidence + widget", () => {
  const d = mkObj({ type: "sr_level", layer: "levels", source_tf: "D", lo: 1.1, hi: 1.102 });
  const h = mkObj({ type: "fvg", layer: "fvg", source_tf: "H1", direction: "bull", lo: 1.101, hi: 1.1015 });
  const o = mkObj({ type: "fvg", layer: "fvg", source_tf: "M15", direction: "bear", lo: 1.1011, hi: 1.1012 });

  beforeEach(() => {
    useDeskUiStore.setState({ selectedObjectId: null, evidenceOpen: false, asOf: "latest" });
    useAnalysisStore.getState().setAnalysis({ objects: [d, h, o], relations: buildRelations([d, h, o]), projected: new Set(), dataKind: "sample", viewTf: "H1" });
  });

  it("store derives confluence; describeObject lists MTF supports and conflicts", () => {
    const c = useAnalysisStore.getState().confluence;
    const x = describeObject(h, "evidence", { confluence: c.byObject[h.id] });
    expect(x.supports.some((l) => l.includes("Confluent with D"))).toBe(true);
    expect(x.conflicts.some((l) => l.includes("Opposes M15"))).toBe(true);
    expect(describeObject(h, "headline", { confluence: c.byObject[h.id] }).supports).toEqual([]);
  });

  it("widget lists contradictions first with non-colour cues and selects on click", async () => {
    render(<ConfluenceBody />);
    const heads = screen.getAllByRole("heading", { level: 4 }).map((n) => n.textContent);
    expect(heads[0]).toMatch(/^Contradictions/);
    expect(screen.getByText(/Heuristic/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: /Contradiction:/ }));
    expect(useDeskUiStore.getState().selectedObjectId).not.toBeNull();
  });

  it("empty state explains the fix; widget is standard-level and in Analysis", () => {
    useAnalysisStore.getState().setAnalysis({ objects: [], relations: [], projected: new Set(), dataKind: "sample", viewTf: "H1" });
    render(<ConfluenceBody />);
    expect(screen.getByText(/widen lookback/)).toBeTruthy();
    expect(defaultWidgets("analysis", "minimal").map((w) => w.id)).not.toContain("confluence");
    expect(defaultWidgets("analysis", "standard").map((w) => w.id)).toContain("confluence");
  });
});