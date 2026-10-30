/** F9 — frozen "sample" regime series for the strip (CONTRACTS RegimeSnapshot). Earlier snapshots become
 *  available a minute after t_event; one is data-degraded to exercise the P0 warning. */
import { SAMPLE_NOW, SAMPLE_REGIME } from "@/intel/fixtures";
import type { RegimeSnapshot } from "@/intel/contracts";

const mk = (dt: number, over: Partial<RegimeSnapshot>): RegimeSnapshot => ({
  ...SAMPLE_REGIME,
  id: `regime:EUR_USD:${SAMPLE_NOW - dt}`,
  t_event: SAMPLE_NOW - dt,
  available_at: SAMPLE_NOW - dt + 60,
  ...over,
});

export const SAMPLE_REGIME_SERIES: readonly RegimeSnapshot[] = Object.freeze([
  mk(10_800, { structure_state: "range", volatility_state: "dead", trend_strength: 0.2, momentum_state: "fading", transition_risk: 0.2, timeframe_alignment: "mixed" }),
  mk(7_200, { structure_state: "compression", volatility_state: "dead", trend_strength: 0.25, momentum_state: "stable", transition_risk: 0.6, timeframe_alignment: "mixed" }),
  mk(3_600, { structure_state: "transition", volatility_state: "expanding", trend_strength: 0.5, momentum_state: "strengthening", transition_risk: 0.8, timeframe_alignment: "conflict", data_quality: "degraded" }),
  SAMPLE_REGIME,
]);