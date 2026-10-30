import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ForecastDistributionSchema, ScenarioSpecificationSchema, ScenarioStateSchema } from "@/intel/contracts";
import { SAMPLE_ENGINE_OBJECTS, SAMPLE_NOW } from "@/intel/fixtures";
import { STUDIO_FORECASTS, STUDIO_SCENARIOS, STUDIO_STATES } from "./scenarioFixtures";
import { buildStudio, forecastGate, scenarioFocus } from "./studio";
import { ScenarioStudio } from "./ScenarioStudio";
import { useScenarioStore } from "./scenarioStore";
import { CanvasRoot } from "../CanvasRoot";
import { useCanvasStore } from "../canvasStore";
import { usePrepareStore } from "../prepare/prepareStore";

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  useScenarioStore.getState().reset();
  useCanvasStore.setState({ mode: "prepare", selectedSourceId: null, selectedInsightId: null });
  usePrepareStore.getState().reset();
});

const view = (asOf = SAMPLE_NOW) => buildStudio(STUDIO_SCENARIOS, STUDIO_STATES, STUDIO_FORECASTS, asOf);

describe("F11 studio (pure, causal, honest)", () => {
  it("fixtures conform to the contracts", () => {
    for (const s of STUDIO_SCENARIOS) expect(() => ScenarioSpecificationSchema.parse(s)).not.toThrow();
    for (const s of STUDIO_STATES) expect(() => ScenarioStateSchema.parse(s)).not.toThrow();
    for (const f of STUDIO_FORECASTS) expect(() => ForecastDistributionSchema.parse(f)).not.toThrow();
  });

  it("nothing is visible before spec.asOf; revision keeps history", () => {
    expect(view(0)).toHaveLength(0);
    const early = view(SAMPLE_NOW - 7_200);
    expect(early.map((v) => v.id)).toEqual(["scn:1"]);
    expect(early[0]!.version).toBe("1");
    const now = view().find((v) => v.id === "scn:1")!;
    expect(now.version).toBe("2");
    expect(now.history.map((h) => h.version)).toEqual(["1"]);
  });

  it("state is applied only once available; fired conditions flow through", () => {
    const before = buildStudio(STUDIO_SCENARIOS, STUDIO_STATES, [], SAMPLE_NOW - 1).find((v) => v.id === "scn:1")!;
    expect(before.branches[0]!.conditions.every((c) => !c.fired)).toBe(true);
    const after = view().find((v) => v.id === "scn:1")!;
    expect(after.branches[0]!.conditions.find((c) => c.text === "holds support")!.fired).toBe(true);
  });

  it("B vs C categories; Category B never carries forecast numbers", () => {
    const v = view();
    expect(v.find((x) => x.id === "scn:1")!.category).toBe("B");
    expect(v.find((x) => x.id === "scn:1")!.forecast).toBeUndefined();
    expect(v.find((x) => x.id === "scn:2")!.category).toBe("C");
  });

  it("uncalibrated model → numbers withheld; calibrated → shown; no modelRef → withheld", () => {
    const spec = STUDIO_SCENARIOS.find((s) => s.id === "scn:2")!;
    const w = forecastGate(spec, STUDIO_FORECASTS, SAMPLE_NOW);
    expect(w.state).toBe("withheld");
    expect(w.distribution).toBeUndefined();
    const cal = { ...STUDIO_FORECASTS[0]!, calibration: { oosReliability: 0.9, sharpness: 0.2, sampleSize: 500 } };
    expect(forecastGate(spec, [cal], SAMPLE_NOW).distribution).toBeDefined();
    const { modelRef: _m, ...noModel } = spec;
    expect(forecastGate(noModel, [cal], SAMPLE_NOW).state).toBe("withheld");
  });

  it("branch past expiry is expired; broken invalidation → invalidated (P0 flag)", () => {
    const late = view(SAMPLE_NOW + 2 * 86_400).find((v) => v.id === "scn:1")!;
    expect(late.branches.every((b) => b.status === "expired")).toBe(true);
    const broken = buildStudio(STUDIO_SCENARIOS, [{ ...STUDIO_STATES[0]!, status: "invalidated", brokenInvalidations: ["close below support"] }], [], SAMPLE_NOW);
    const s1 = broken.find((v) => v.id === "scn:1")!;
    expect(s1.invalidated).toBe(true);
    expect(s1.status).toBe("invalidated");
  });

  it("chart focus resolves only real, knowable geometry; the rest is listed unresolved", () => {
    const s1 = view().find((v) => v.id === "scn:1")!;
    const f0 = scenarioFocus(s1, 0, SAMPLE_ENGINE_OBJECTS, SAMPLE_NOW);
    expect(f0.primitives).toHaveLength(1);
    expect(f0.mappings[0]!.scenarioId).toBe("scn:1");
    expect(f0.mappings[0]!.visibility).toBe("focused");
    expect(scenarioFocus(s1, 1, SAMPLE_ENGINE_OBJECTS, SAMPLE_NOW).primitives).toHaveLength(0);
    const notYet = scenarioFocus(s1, 0, SAMPLE_ENGINE_OBJECTS, 1_746_813_000); // before object known_at
    expect(notYet.primitives).toHaveLength(0);
    expect(notYet.unresolved).toHaveLength(1);
  });
});

describe("F11 Scenario Studio UI", () => {
  const ui = () => render(<ScenarioStudio specs={STUDIO_SCENARIOS} states={STUDIO_STATES} forecasts={STUDIO_FORECASTS} objects={SAMPLE_ENGINE_OBJECTS} asOf={SAMPLE_NOW} />);

  it("renders labelled B/C items with distinct text + glyph, marked sample", () => {
    ui();
    const b = screen.getByRole("button", { name: /Scenario scn:1 — Conditional/ });
    const c = screen.getByRole("button", { name: /Scenario scn:2 — Statistical forecast/ });
    expect(b.getAttribute("data-cat")).toBe("B");
    expect(c.getAttribute("data-cat")).toBe("C");
    expect(b.textContent).toContain("◇");
    expect(c.textContent).toContain("▣");
    expect(screen.getByLabelText("Scenario Studio").textContent).toMatch(/sample/);
  });

  it("selecting a scenario updates chart focus; invalidation + triggers always shown", async () => {
    const user = userEvent.setup();
    ui();
    expect(screen.queryByLabelText("Chart focus")).toBeNull();
    await user.click(screen.getByRole("button", { name: /Scenario scn:1 —/ }));
    expect(screen.getByLabelText("Chart focus").textContent).toMatch(/1 drawn/);
    expect(screen.getByLabelText("Invalidation").textContent).toMatch(/close below support/);
    expect(screen.getByLabelText("Triggers").textContent).toMatch(/holds support/);
    await user.click(screen.getByRole("button", { name: "range" }));
    expect(screen.getByLabelText("Chart focus").textContent).toMatch(/0 drawn/);
    expect(screen.getByLabelText("Chart focus").textContent).toMatch(/text only/);
  });

  it("honesty: no % or numbers for B; uncalibrated C shows a withheld note, no distribution", async () => {
    const user = userEvent.setup();
    ui();
    await user.click(screen.getByRole("button", { name: /Scenario scn:1 —/ }));
    expect(screen.getByLabelText("Scenario scn:1 detail").textContent).not.toMatch(/%|probab/i);
    await user.click(screen.getByRole("button", { name: /Scenario scn:2 —/ }));
    const f = screen.getByLabelText("Forecast");
    expect(f.textContent).toMatch(/withheld/);
    expect(f.textContent).not.toMatch(/up:|flat:|down:|0\.34/);
  });

  it("mounted in the Canvas when the Scenarios source is selected", async () => {
    const user = userEvent.setup();
    render(<CanvasRoot />);
    expect(screen.queryByLabelText("Scenario Studio")).toBeNull();
    await user.click(screen.getByRole("button", { name: /^Scenarios\s*2 active/ }));
    expect(screen.getByLabelText("Scenario Studio")).toBeTruthy();
  });
});