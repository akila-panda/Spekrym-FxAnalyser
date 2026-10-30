/** F12 — frozen "sample" timeline fixtures. Which entries were captured live (recorded) is explicit;
 *  everything else is reconstructed. Composes the existing sample insights/objects/scenarios/regimes. */
import { SAMPLE_ENGINE_OBJECTS, SAMPLE_INSIGHTS, SAMPLE_NOW } from "@/intel/fixtures";
import { SAMPLE_REGIME_SERIES } from "../context/regimeFixtures";
import { STUDIO_SCENARIOS } from "../scenario/scenarioFixtures";
import { buildTimeline, type TimelineInput } from "./timeline";

/** Captured live: the insight, the latest scenario revision, and the last two regime snapshots. */
export const RECORDED_IDS: ReadonlySet<string> = new Set([
  "ins:1",
  "scn:1:v2",
  ...SAMPLE_REGIME_SERIES.slice(-2).map((r) => r.id),
]);

export const TIMELINE_INPUT: TimelineInput = {
  insights: SAMPLE_INSIGHTS,
  objects: SAMPLE_ENGINE_OBJECTS,
  scenarios: STUDIO_SCENARIOS,
  regimes: SAMPLE_REGIME_SERIES,
  recordedIds: RECORDED_IDS,
};

export const SAMPLE_TIMELINE = buildTimeline(TIMELINE_INPUT);
export const TIMELINE_NOW = SAMPLE_NOW;