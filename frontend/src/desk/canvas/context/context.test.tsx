import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { RegimeSnapshotSchema } from "@/intel/contracts";
import { SAMPLE_NOW } from "@/intel/fixtures";
import { SAMPLE_REGIME_SERIES } from "./regimeFixtures";
import { band, describeRegime, familyPanels, knownSnapshots, regimeAt, regimeWarning, stripSegments } from "./regime";
import { FamilyPanels, RegimeStrip } from "./RegimeStrip";

describe("F9 regime (pure, causal)", () => {
  it("fixture series conforms to the RegimeSnapshot contract", () => {
    for (const s of SAMPLE_REGIME_SERIES) expect(() => RegimeSnapshotSchema.parse(s)).not.toThrow();
  });

  it("regime at the viewed time = latest snapshot known by asOf; none before the first", () => {
    expect(regimeAt(SAMPLE_REGIME_SERIES, 0)).toBeNull();
    expect(regimeAt(SAMPLE_REGIME_SERIES, SAMPLE_NOW)!.structure_state).toBe("range");
    expect(regimeAt(SAMPLE_REGIME_SERIES, SAMPLE_NOW - 7_200 + 60)!.structure_state).toBe("compression");
  });

  it("respects available_at: an event that has happened but isn't yet available is not shown", () => {
    const t = SAMPLE_NOW - 3_600; // t_event of the transition snapshot; available 60s later
    expect(regimeAt(SAMPLE_REGIME_SERIES, t)!.structure_state).toBe("compression");
    expect(regimeAt(SAMPLE_REGIME_SERIES, t + 60)!.structure_state).toBe("transition");
    expect(knownSnapshots(SAMPLE_REGIME_SERIES, t)).toHaveLength(2);
  });

  it("strip marks exactly one current segment and never includes the future", () => {
    const segs = stripSegments(SAMPLE_REGIME_SERIES, SAMPLE_NOW - 7_200 + 60);
    expect(segs).toHaveLength(2);
    expect(segs.filter((s) => s.current)).toHaveLength(1);
  });

  it("is qualitative (D10): no probabilities, numeric fields become bands", () => {
    expect([band(0.1), band(0.5), band(0.9)]).toEqual(["low", "moderate", "high"]);
    const d = describeRegime(SAMPLE_REGIME_SERIES[3]!);
    expect(JSON.stringify(d)).not.toMatch(/_p|bullish|bearish|neutral/);
    expect(Object.keys(d)).toEqual(["regime", "htf", "execution"]); // three separate groups
  });

  it("degraded data raises a warning; valid data does not", () => {
    expect(regimeWarning(SAMPLE_REGIME_SERIES[2]!)).toMatch(/degraded/);
    expect(regimeWarning(SAMPLE_REGIME_SERIES[3]!)).toBeNull();
    expect(regimeWarning(null)).toBeNull();
  });

  it("conditional families degrade to 'unavailable' (never invented)", () => {
    const p = familyPanels(SAMPLE_REGIME_SERIES[3]!);
    expect(p.find((x) => x.id === "trend")!.status).toBe("ok");
    for (const id of ["statistical", "relative", "volume", "options"]) expect(p.find((x) => x.id === id)!.status).toBe("unavailable");
    expect(familyPanels(null).every((x) => x.status === "unavailable")).toBe(true);
  });
});

describe("F9 regime strip UI", () => {
  it("renders the strip with sample label, three descriptor groups, and no numbers-as-probabilities", () => {
    render(<RegimeStrip series={SAMPLE_REGIME_SERIES} asOf={SAMPLE_NOW} />);
    const strip = screen.getByLabelText("Regime strip");
    expect(strip.textContent).toMatch(/sample/);
    expect(screen.getByLabelText("Regime state")).toBeTruthy();
    expect(screen.getByLabelText("Higher-timeframe alignment")).toBeTruthy();
    expect(screen.getByLabelText("Execution conditions")).toBeTruthy();
    expect(strip.textContent).not.toMatch(/%|0\.\d/);
    expect(strip.querySelector("[aria-current='true']")).not.toBeNull();
  });

  it("shows nothing before it was knowable, and the P0 warning when degraded", () => {
    const { unmount } = render(<RegimeStrip series={SAMPLE_REGIME_SERIES} asOf={0} />);
    expect(screen.getByLabelText("Regime strip").textContent).toMatch(/No regime known yet/);
    unmount();
    render(<RegimeStrip series={SAMPLE_REGIME_SERIES} asOf={SAMPLE_NOW - 3_600 + 60} />);
    expect(screen.getByRole("alert").textContent).toMatch(/degraded/);
  });

  it("family panels render ok + unavailable families with text status", () => {
    render(<FamilyPanels series={SAMPLE_REGIME_SERIES} asOf={SAMPLE_NOW} />);
    expect(screen.getByLabelText("Family Trend & momentum").textContent).toMatch(/Momentum/);
    expect(screen.getByLabelText("Family Options").textContent).toMatch(/Unavailable/);
  });
});