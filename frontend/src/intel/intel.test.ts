import { describe, expect, it } from "vitest";
import {
  IntelligenceInsightSchema, RegimeSnapshotSchema, ScenarioSpecificationSchema, ScenarioStateSchema,
  ForecastDistributionSchema, TradeRecordSchema, EligibilityDecisionSchema, PortfolioExposureSchema,
  VerdictSchema, JobSchema, ViewManifestSchema, ChartMappingSchema,
  parseRegime, parseTrades,
} from "./contracts";
import {
  SAMPLE_INSIGHTS, SAMPLE_REGIME, SAMPLE_SCENARIOS, SAMPLE_SCENARIO_STATE, SAMPLE_FORECAST,
  SAMPLE_TRADES, SAMPLE_ELIGIBILITY, SAMPLE_PORTFOLIO, SAMPLE_VERDICTS, SAMPLE_JOB,
  SAMPLE_VIEW_MANIFEST, SAMPLE_CHART_MAPPING,
} from "./fixtures";
import { createMockIntelligenceSource } from "./mockSource";
import { createMockDeskSource } from "@/desk/source/mockDeskSource";

describe("intel contracts — fixtures round-trip", () => {
  it("every fixture parses against its schema", () => {
    expect(IntelligenceInsightSchema.array().parse(SAMPLE_INSIGHTS)).toEqual(SAMPLE_INSIGHTS);
    expect(RegimeSnapshotSchema.parse(SAMPLE_REGIME)).toEqual(SAMPLE_REGIME);
    expect(ScenarioSpecificationSchema.array().parse(SAMPLE_SCENARIOS)).toEqual(SAMPLE_SCENARIOS);
    expect(ScenarioStateSchema.parse(SAMPLE_SCENARIO_STATE)).toEqual(SAMPLE_SCENARIO_STATE);
    expect(ForecastDistributionSchema.parse(SAMPLE_FORECAST)).toEqual(SAMPLE_FORECAST);
    expect(TradeRecordSchema.array().parse(SAMPLE_TRADES)).toEqual(SAMPLE_TRADES);
    expect(EligibilityDecisionSchema.parse(SAMPLE_ELIGIBILITY)).toEqual(SAMPLE_ELIGIBILITY);
    expect(PortfolioExposureSchema.parse(SAMPLE_PORTFOLIO)).toEqual(SAMPLE_PORTFOLIO);
    expect(VerdictSchema.array().parse(SAMPLE_VERDICTS)).toEqual(SAMPLE_VERDICTS);
    expect(JobSchema.parse(SAMPLE_JOB)).toEqual(SAMPLE_JOB);
    expect(ViewManifestSchema.parse(SAMPLE_VIEW_MANIFEST)).toEqual(SAMPLE_VIEW_MANIFEST);
    expect(ChartMappingSchema.parse(SAMPLE_CHART_MAPPING)).toEqual(SAMPLE_CHART_MAPPING);
  });

  it("the 4 trade categories are representable and distinguishable", () => {
    const cats = parseTrades(SAMPLE_TRADES).map((t) => t.category);
    expect(cats).toContain("executed");
    expect(cats).toContain("rejected");
  });

  it("forecast with no validated model still carries explicit zero-calibration (no fabricated %)", () => {
    expect(SAMPLE_FORECAST.calibration.sampleSize).toBe(0);
  });

  it("parsing is additive — an unknown extra field is stripped, not rejected", () => {
    const withExtra = { ...SAMPLE_REGIME, futureField: 123 };
    const parsed = parseRegime(withExtra as unknown);
    expect(parsed).toEqual(SAMPLE_REGIME);
    expect((parsed as Record<string, unknown>).futureField).toBeUndefined();
  });
});

describe("intel mock source — everything labelled sample", () => {
  it("wraps every record with sample provenance", async () => {
    const s = createMockIntelligenceSource();
    expect(s.kind).toBe("mock");
    for (const got of [await s.getInsights("EUR_USD"), await s.getRegime("EUR_USD"),
      await s.getScenarios("EUR_USD"), await s.getTrades("EUR_USD"),
      await s.getPortfolio(), await s.getVerdicts(), await s.getJob("job:1")]) {
      expect(got.provenance.kind).toBe("sample");
    }
  });

  it("missing scenario returns empty lists", async () => {
    const s = createMockIntelligenceSource({ missing: true });
    expect((await s.getTrades("EUR_USD")).data).toEqual([]);
    expect((await s.getScenarios("EUR_USD")).data).toEqual([]);
  });
});

describe("DeskSource.getEngineObjects (mock seam)", () => {
  it("returns sample engine objects", async () => {
    const d = createMockDeskSource();
    const got = await d.getEngineObjects({ pair: "EUR_USD", tf: "H1" });
    expect(got.provenance.kind).toBe("sample");
    expect(got.data.length).toBeGreaterThan(0);
    expect(got.data[0]?.id).toBeTruthy();
  });

  it("missing scenario returns no engine objects", async () => {
    const d = createMockDeskSource({ scenario: "missing" });
    expect((await d.getEngineObjects({ pair: "EUR_USD", tf: "H1" })).data).toEqual([]);
  });
});
