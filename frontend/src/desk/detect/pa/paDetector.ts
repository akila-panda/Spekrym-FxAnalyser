/** DESK DK11 — price-action detector: impulses (+ correction lifecycle), ranges (+ breakout facts), trendlines,
 *  candle signals within location. Candle signals read `prior` (earlier-registered detectors). */
import type { Detector } from "../registry";
import { buildImpulses, buildRanges, buildTrendlines } from "./objects";
import { buildSignals } from "./signals";

export const paDetector: Detector = {
  id: "priceAction",
  version: 1,
  run(k, ctx, prior = []) {
    return [...buildImpulses(k, ctx), ...buildRanges(k, ctx), ...buildTrendlines(k, ctx), ...buildSignals(k, ctx, prior)];
  },
};