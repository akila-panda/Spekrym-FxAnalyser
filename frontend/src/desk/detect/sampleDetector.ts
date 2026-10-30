/** DESK DK3 — sample detector (swings + displacement impulses) built on the DK2 kernel.
 *  Proves the pipeline end-to-end; DK4+ add real detectors. Swing direction: high → "bear" (turn down),
 *  low → "bull" (turn up). Causal: known_at = confirmation bar close (swing) / displacement end close. */
import { objectId } from "@/desk/lib/ids";
import type { AnalysisObject } from "@/desk/types/schemas";
import type { Candle } from "@/types/market";
import type { Detector } from "./registry";

export const sampleDetector: Detector = {
  id: "sample",
  version: 1,
  run(k, ctx) {
    const out: AnalysisObject[] = [];
    const provenance = {
      rulesVersion: ctx.rulesVersion, dataKind: ctx.dataKind, detector: "sample", detectorVersion: 1,
    };
    for (const s of k.swingsSwing) {
      const isHigh = s.kind === "high";
      out.push({
        id: objectId({ type: "swing", pair: ctx.pair, tf: ctx.tf, anchorTimes: [s.time, isHigh ? 1 : 0] }),
        type: "swing",
        layer: "structure",
        pair: ctx.pair,
        source_tf: ctx.tf,
        direction: isHigh ? "bear" : "bull",
        geometry: { bands: [{ pHigh: s.price, pLow: s.price }], points: [{ t: s.time, p: s.price }], anchorTimes: [s.time, isHigh ? 1 : 0] },
        t_event: s.time,
        known_at: s.known_at,
        confirmed_at: null,
        lifecycle: [],
        grade: {
          significance: null, relevance: null, quality: null, freshness: null,
          factors: [{ id: "scale", label: `${s.n}-bar swing on each side`, status: "supports", value: s.n }],
        },
        provenance,
        evidence: [{ t: s.time, note: `Highest/lowest of ${s.n} bars each side; confirmed ${s.n} bars later.` }],
      });
    }
    for (const d of k.displacements) {
      const bars = k.bars.slice(d.startIndex, d.endIndex + 1) as Candle[];
      const pHigh = Math.max(...bars.map((b) => b.high));
      const pLow = Math.min(...bars.map((b) => b.low));
      const anchors = [d.startTime, d.endTime];
      out.push({
        id: objectId({ type: "impulse", pair: ctx.pair, tf: ctx.tf, anchorTimes: anchors }),
        type: "impulse",
        layer: "priceAction",
        pair: ctx.pair,
        source_tf: ctx.tf,
        direction: d.direction,
        geometry: { bands: [{ pHigh, pLow }], anchorTimes: anchors },
        t_event: d.startTime,
        known_at: d.known_at,
        confirmed_at: null,
        lifecycle: [],
        origin_id: d.id,
        grade: {
          significance: null, relevance: null, quality: null, freshness: null,
          factors: [{ id: "magnitude", label: `Displacement ${d.magnitudeAtr.toFixed(1)} ATR`, status: "supports", value: d.magnitudeAtr }],
        },
        provenance,
        evidence: [{ t: d.endTime, note: `${bars.length} same-direction bar(s) moved ${d.magnitudeAtr.toFixed(1)}× ATR.` }],
      });
    }
    return out;
  },
};