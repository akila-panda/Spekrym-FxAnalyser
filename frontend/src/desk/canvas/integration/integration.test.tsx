import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntelligenceInsightSchema } from "@/intel/contracts";
import { SAMPLE_ENGINE_OBJECTS, SAMPLE_NOW } from "@/intel/fixtures";
import { SAMPLE_REGIME_SERIES } from "../context/regimeFixtures";
import { STUDIO_FORECASTS, STUDIO_SCENARIOS, STUDIO_STATES } from "../scenario/scenarioFixtures";
import { INTEGRATION_ELIGIBILITY, INTEGRATION_INSIGHTS, INTEGRATION_TRADES } from "./integrationFixtures";
import { buildEngineLayer, enginesIn, EVIDENCE_TYPES, IDENTITY, type EngineLayerInput } from "./engineLayer";
import { EngineLayer } from "./EngineLayerPanel";
import { CanvasRoot } from "../CanvasRoot";
import { useCanvasStore } from "../canvasStore";
import { usePrepareStore } from "../prepare/prepareStore";
import { useTimelineStore } from "../timeline/timelineStore";

const input = (asOf = SAMPLE_NOW, over: Partial<EngineLayerInput> = {}): EngineLayerInput => ({
  objects: SAMPLE_ENGINE_OBJECTS, insights: INTEGRATION_INSIGHTS, regimes: SAMPLE_REGIME_SERIES,
  scenarios: STUDIO_SCENARIOS, scenarioStates: STUDIO_STATES, forecasts: STUDIO_FORECASTS,
  trades: INTEGRATION_TRADES, eligibility: INTEGRATION_ELIGIBILITY, instrument: "EUR_USD", asOf, ...over,
});

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  useTimelineStore.getState().reset();
  useCanvasStore.setState({ mode: "prepare", selectedSourceId: null, selectedInsightId: null });
  usePrepareStore.getState().reset();
});

describe("F13 cross-engine layer (pure)", () => {
  it("fixture insights conform to the contract", () => {
    for (const i of INTEGRATION_INSIGHTS) expect(() => IntelligenceInsightSchema.parse(i)).not.toThrow();
  });

  it("GF3: every engine's mock output is present in one list", () => {
    const e = enginesIn(buildEngineLayer(input()));
    for (const id of ["observed", "regime", "scenario", "forecast", "strategy", "macro", "brain", "session"]) expect(e).toContain(id);
  });

  it("the 5 evidence types have pairwise-distinct glyph, name and border shape", () => {
    for (const k of ["glyph", "name", "border"] as const) {
      expect(new Set(EVIDENCE_TYPES.map((t) => IDENTITY[t][k])).size).toBe(EVIDENCE_TYPES.length);
    }
  });

  it("each source renders with its own identity (observed / regime / scenario / signal / brain)", () => {
    const items = buildEngineLayer(input());
    const by = (id: string) => items.find((i) => i.id === id)!;
    expect(by(SAMPLE_ENGINE_OBJECTS[0]!.id).evidenceType).toBe("observed_fact");
    expect(items.find((i) => i.engine === "regime")!.evidenceType).toBe("interpretation");
    expect(by("scn:1:v2").evidenceType).toBe("conditional_scenario");
    expect(by("t:v1").evidenceType).toBe("validated_signal");
    expect(by("ins:brain:1").evidenceType).toBe("interpretation");
  });

  it("discretionary ≠ validated: only a validated/vault tier yields a validated signal", () => {
    const items = buildEngineLayer(input());
    const exploratory = items.find((i) => i.id === "t:1")!;
    expect(exploratory.evidenceType).not.toBe("validated_signal");
    expect(exploratory.discretionary).toBe(true);
    const val = items.find((i) => i.id === "t:v1")!;
    expect(val.discretionary).toBe(false);
    const noTier = buildEngineLayer(input(SAMPLE_NOW, { eligibility: [] })).find((i) => i.id === "t:v1")!;
    expect(noTier.evidenceType).not.toBe("validated_signal");
    expect(items.every((i) => i.evidenceType !== "validated_signal" || !i.discretionary)).toBe(true);
    expect(items.find((i) => i.id === "t:4")!.hypothetical).toBe(true);
  });

  it("no fabricated forecast: uncalibrated C is never a calibrated forecast; brain is a proposal", () => {
    const items = buildEngineLayer(input());
    expect(items.some((i) => i.evidenceType === "calibrated_forecast")).toBe(false);
    expect(items.find((i) => i.id === "scn:2:v1")!.note).toMatch(/uncalibrated/);
    expect(items.find((i) => i.id === "ins:brain:1")!).toMatchObject({ proposal: true, discretionary: true });
  });

  it("no invented geometry: non-geometric items are context only", () => {
    const items = buildEngineLayer(input());
    expect(items.find((i) => i.id === "ins:brain:1")!.surface).toBe("context");
    expect(items.find((i) => i.id === "ins:macro:1")!.surface).toBe("context");
    expect(items.find((i) => i.engine === "regime")!.surface).toBe("context");
    expect(items.find((i) => i.id === "t:v1")!.surface).toBe("chart");
  });

  it("P0 (macro risk) sorts first; causal: nothing before availableAt", () => {
    const items = buildEngineLayer(input());
    expect(items[0]!.p0).toBe(true);
    expect(items.some((i) => i.id === "ins:macro:1" && i.p0)).toBe(true);
    expect(buildEngineLayer(input(0))).toHaveLength(0);
    const early = buildEngineLayer(input(SAMPLE_NOW - 3_000));
    for (const i of early) expect(i.availableAt).toBeLessThanOrEqual(SAMPLE_NOW - 3_000);
    expect(early.find((i) => i.id === "t:v1")).toBeUndefined();
  });
});

describe("F13 UI", () => {
  it("renders legend + every item with text identity, on-chart/context labels, sample", () => {
    render(<EngineLayer items={buildEngineLayer(input())} />);
    const panel = screen.getByLabelText("Cross-engine layer");
    expect(within(panel).getByLabelText("Evidence types").querySelectorAll("li")).toHaveLength(5);
    expect(panel.textContent).toMatch(/sample/);
    expect(panel.textContent).toMatch(/context only/);
    expect(panel.textContent).toMatch(/on chart/);
    expect(panel.textContent).toMatch(/discretionary — not validated/);
    expect(panel.textContent).toMatch(/⚠ P0/);
    expect(panel.textContent).not.toMatch(/%/);
    const star = panel.querySelector('[data-engine="strategy"][data-type="validated_signal"]')!;
    expect(star.textContent).toContain("★");
    expect(star.textContent).not.toMatch(/not validated/);
  });

  it("GF3: mounted in the Canvas in every mode and follows the replay cursor", async () => {
    const user = userEvent.setup();
    render(<CanvasRoot />);
    for (const m of ["Prepare", "Explore", "Monitor", "Review"]) {
      await user.click(screen.getByRole("button", { name: m }));
      expect(screen.getByLabelText("Cross-engine layer")).toBeTruthy();
    }
    const n = () => screen.getByLabelText("Engine items").querySelectorAll("li").length;
    const live = n();
    expect(live).toBeGreaterThan(5);
    for (let i = 0; i < 4; i++) await user.click(screen.getByRole("button", { name: "Step timeline back" }));
    expect(n()).toBeLessThan(live);
  });
});
