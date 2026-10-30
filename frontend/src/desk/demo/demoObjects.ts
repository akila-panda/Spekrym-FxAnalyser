/** DEMO (removable) — sample AnalysisObjects derived from the demo candles so overlays land on real price/
 *  time. Causal: each object's known_at is its confirmation bar close. Delete src/desk/demo/ to remove. */
import type { AnalysisObject, ObjectType, LayerId } from "@/desk/types/schemas";
import { PAIR_META, TF_SECONDS, type Pair, type Timeframe } from "@/types/market";
import { DEMO_PAIR, DEMO_TF, demoCandles } from "./demoCandles";

const LAYER_OF: Partial<Record<ObjectType, LayerId>> = {
  sr_level: "levels", sd_zone: "supplyDemand", sweep: "liquidity", fvg: "fvg",
};

function mk(o: {
  type: ObjectType; pair: Pair; tf: Timeframe; bands: { pHigh: number; pLow: number }[];
  t: number; step: number; direction?: "bull" | "bear";
}): AnalysisObject {
  return {
    id: `${o.type}:${o.pair}:${o.tf}:${o.t}`,
    type: o.type, layer: LAYER_OF[o.type] ?? "structure", pair: o.pair, source_tf: o.tf,
    ...(o.direction ? { direction: o.direction } : {}),
    geometry: { bands: o.bands, anchorTimes: [o.t] },
    t_event: o.t, known_at: o.t + o.step, confirmed_at: null, lifecycle: [],
    provenance: { rulesVersion: "demo-0", dataKind: "sample", detector: "demo", detectorVersion: 0 },
    evidence: [],
  };
}

/** Three sample objects on the recent window: a resistance level, a demand zone, and a liquidity sweep. */
export function demoObjects(pair: Pair = DEMO_PAIR, tf: Timeframe = DEMO_TF): AnalysisObject[] {
  const cs = demoCandles(pair, tf);
  const win = cs.slice(Math.max(0, cs.length - 180));
  if (win.length === 0) return [];
  const step = TF_SECONDS[tf];
  const pip = PAIR_META[pair].pip;

  let hi = win[0]!, lo = win[0]!;
  for (const c of win) { if (c.high > hi.high) hi = c; if (c.low < lo.low) lo = c; }

  // a sweep: the first bar after the high that trades above hi.high then closes back below it
  const hiIdx = win.indexOf(hi);
  const swept = win.slice(hiIdx + 1).find((c) => c.high > hi.high && c.close < hi.high) ?? hi;

  return [
    mk({ type: "sr_level", pair, tf, bands: [{ pHigh: hi.high + pip, pLow: hi.high - pip }], t: hi.time, step }),
    mk({ type: "sd_zone", pair, tf, bands: [{ pHigh: lo.low + 6 * pip, pLow: lo.low }], t: lo.time, step, direction: "bull" }),
    mk({ type: "sweep", pair, tf, bands: [{ pHigh: swept.high, pLow: swept.high }], t: swept.time, step }),
  ];
}
