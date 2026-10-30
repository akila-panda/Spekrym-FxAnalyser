/** F11 — frozen "sample" studio fixtures (additive; conform to the ScenarioSpecification / ScenarioState /
 *  ForecastDistribution contracts). scn:1 has a revision (v1 → v2); scn:2 is a Category-C scenario whose
 *  model is NOT calibrated, so the studio must withhold its numbers. */
import type { ForecastDistribution, ScenarioSpecification, ScenarioState } from "@/intel/contracts";
import { SAMPLE_FORECAST, SAMPLE_NOW } from "@/intel/fixtures";

const REF = "sr_level:EUR_USD:H1:1746810000";
const DAY = 86_400;

export const STUDIO_SCENARIOS: ScenarioSpecification[] = [
  {
    id: "scn:1", version: "1", instrument: "EUR_USD", asOf: SAMPLE_NOW - 7_200, kind: "conditional",
    branches: [
      { label: "bullish continuation", geometryRefs: [REF], conditions: ["holds support"], invalidation: "close below support", horizon: DAY, expiry: SAMPLE_NOW + DAY },
    ],
    sourceEngine: "scenario", sourceVersion: "sample-0", evidenceIds: [], objectRefs: [REF],
  },
  {
    id: "scn:1", version: "2", instrument: "EUR_USD", asOf: SAMPLE_NOW, kind: "conditional",
    branches: [
      { label: "bullish continuation", geometryRefs: [REF], conditions: ["holds support", "confirms structure"], invalidation: "close below support", horizon: DAY, expiry: SAMPLE_NOW + DAY },
      { label: "range", geometryRefs: [], conditions: ["stays inside band"], invalidation: "breaks either edge", horizon: DAY, expiry: SAMPLE_NOW + DAY },
    ],
    sourceEngine: "scenario", sourceVersion: "sample-0", evidenceIds: [], objectRefs: [REF],
  },
  {
    id: "scn:2", version: "1", instrument: "EUR_USD", asOf: SAMPLE_NOW, kind: "forecast",
    branches: [
      { label: "next-day direction (model)", geometryRefs: [REF], conditions: ["model refresh on next close"], invalidation: "model drift flag", horizon: DAY, expiry: SAMPLE_NOW + DAY },
    ],
    sourceEngine: "forecast", sourceVersion: "sample-0", evidenceIds: [], objectRefs: [REF], modelRef: "sample-model",
  },
];

export const STUDIO_STATES: ScenarioState[] = [
  { scenarioId: "scn:1", version: "2", asOf: SAMPLE_NOW, status: "active", firedConditions: ["holds support"], brokenInvalidations: [], observedAt: SAMPLE_NOW, availableAt: SAMPLE_NOW },
];

/** Uncalibrated sample model (sampleSize 0) — numbers must be withheld. */
export const STUDIO_FORECASTS: ForecastDistribution[] = [SAMPLE_FORECAST];