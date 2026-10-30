import { describe, expect, it } from "vitest";
import { SAMPLE_ENGINE_OBJECTS, SAMPLE_INSIGHTS, SAMPLE_NOW } from "@/intel/fixtures";
import { composeCanvas, type ComposedOverlay } from "../pipeline";
import { analysisHref, applyEngineToggles, listEngines } from "./engines";
import { parseExplore } from "./exploreStore";

const ov = (ref: string, sources: string[], priority: 0 | 1 | 2 | 3 = 2): ComposedOverlay => ({
  key: ref, kind: "level", sources, stackCount: 0, priority, evidenceCount: 0,
  primary: { mappingId: `map:${ref}`, sourceModule: sources[0] ?? "s", objectIds: [ref], overlayType: "level", geometryRefs: [ref], visibility: "visible", evidenceIds: [] },
});

describe("F8 engine toggles", () => {
  it("lists distinct engines with counts", () => {
    const e = listEngines([ov("a", ["sr", "session"]), ov("b", ["sr"])]);
    expect(e.map((x) => [x.id, x.count])).toEqual([["session", 1], ["sr", 2]]);
  });

  it("hides an overlay only when all its engines are off", () => {
    const o = [ov("a", ["sr", "session"]), ov("b", ["sr"])];
    expect(applyEngineToggles(o, ["sr"]).map((x) => x.key)).toEqual(["a"]);
    expect(applyEngineToggles(o, ["sr", "session"])).toEqual([]);
    expect(applyEngineToggles(o, [])).toHaveLength(2);
  });

  it("never hides a P0 overlay, even if its engine is toggled off", () => {
    const o = [ov("w", ["risk"], 0), ov("b", ["risk"], 2)];
    expect(applyEngineToggles(o, ["risk"]).map((x) => x.key)).toEqual(["w"]);
  });

  it("is display-only: toggling never changes detection/composition or mutates input", () => {
    const input = { objects: SAMPLE_ENGINE_OBJECTS, insights: SAMPLE_INSIGHTS, asOf: SAMPLE_NOW };
    const before = composeCanvas(input);
    const snapshot = JSON.stringify(before);
    const shown = applyEngineToggles(before.overlays, listEngines(before.overlays).map((e) => e.id));
    expect(shown).toHaveLength(0);
    expect(JSON.stringify(before)).toBe(snapshot);
    expect(JSON.stringify(composeCanvas(input))).toBe(snapshot);
    expect(before.mappings.length).toBeGreaterThan(0);
  });
});

describe("F8 hand-off + prefs", () => {
  it("analysisHref targets Desk → Analysis for the pair", () => {
    const q = new URLSearchParams(analysisHref("EUR_USD", "/app").split("?")[1]);
    expect(analysisHref("EUR_USD", "/app").startsWith("/app?")).toBe(true);
    expect([q.get("app"), q.get("desk"), q.get("pair")]).toEqual(["desk", "analysis", "EUR_USD"]);
    expect(q.get("window")).toBeNull();
  });

  it("parseExplore drops corrupt input", () => {
    expect(parseExplore(null)).toEqual({ hiddenEngines: [] });
    expect(parseExplore({ hiddenEngines: ["a", 3, null] })).toEqual({ hiddenEngines: ["a"] });
    expect(parseExplore({ hiddenEngines: "x" })).toEqual({ hiddenEngines: [] });
  });
});