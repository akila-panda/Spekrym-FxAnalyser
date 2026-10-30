/** DESK DK10 — supply & demand zones with order-block tagging. Causal: known_at = close of the departure's last bar.
 *  Band, direction and grade are frozen at that point; later facts are lifecycle events (see lifecycle.ts).
 *  Shares `origin_id` with FVGs/others via the kernel displacement that covers the departure. */
import { objectId } from "@/desk/lib/ids";
import { DEFAULTS } from "@/desk/methodology/defaults";
import type { AnalysisObject } from "@/desk/types/schemas";
import { PAIR_META, TF_SECONDS, type Candle } from "@/types/market";
import type { Detector } from "../registry";
import { zoneLifecycle } from "./lifecycle";
import { findZones } from "./zones";
import { confirmedRange, rangeFraction } from "../pa/premium";

const r2 = (n: number): number => Math.round(n * 100) / 100;

export const sdDetector: Detector = {
  id: "sd",
  version: 1,
  run(k, ctx) {
    const cfg = ctx.cfg ?? DEFAULTS;
    const S = cfg.supplyDemand;
    const sec = TF_SECONDS[ctx.tf];
    const meta = PAIR_META[ctx.pair];
    const w = cfg.levels.tfWeight[ctx.tf];
    const dec = meta.decimals;
    const bars = k.bars;
    const provenance = { rulesVersion: ctx.rulesVersion, dataKind: ctx.dataKind, detector: "sd", detectorVersion: 1 };
    const out: AnalysisObject[] = [];
    for (const z of findZones(k, cfg)) {
      const bull = z.dir === "bull";
      const endBar = bars[z.depEnd] as Candle;
      const known = endBar.time + sec;
      const h = z.band.hi - z.band.lo;
      const depAtr = z.net / z.atr;
      const origin = k.displacements.find((d) => d.direction === z.dir && d.startIndex >= z.depStart && d.startIndex <= z.depEnd && d.endIndex <= z.depEnd);
      const nBase = z.base ? z.base.to - z.base.from + 1 : 0;
      const tag = z.ob !== null;
      const obOnly = tag && !z.base;
      const range = `${z.band.lo.toFixed(dec)}–${z.band.hi.toFixed(dec)} (${(h / meta.pip).toFixed(1)} pips · ${(h / z.atr).toFixed(1)} ATR)`;
      const depLen = z.depEnd - z.depStart + 1;
      const cr = confirmedRange(k, known);
      const pos = cr ? rangeFraction(cr, (z.band.hi + z.band.lo) / 2) : null;
      const location = () => {
        if (!cr || pos === null) return { id: "location", label: "Premium/discount location unavailable (no confirmed dealing range)", status: "unavailable" as const };
        if (pos < 0 || pos > 1) return { id: "location", label: "Outside the current dealing range", status: "unavailable" as const, value: pos };
        if (pos === 0.5) return { id: "location", label: "At equilibrium of the current dealing range", status: "unavailable" as const, value: pos };
        const discount = pos < 0.5;
        return {
          id: "location", value: pos, status: (discount === bull ? "supports" : "opposes") as "supports" | "opposes",
          label: `${discount ? "Discount" : "Premium"} of the current range (${Math.round(pos * 100)}% of ${cr.lo.price.toFixed(dec)}–${cr.hi.price.toFixed(dec)})`,
        };
      };
      out.push({
        id: objectId({ type: "sd_zone", pair: ctx.pair, tf: ctx.tf, anchorTimes: z.anchorIdx.map((x) => (bars[x] as Candle).time) }),
        type: "sd_zone", layer: "supplyDemand", pair: ctx.pair, source_tf: ctx.tf, direction: z.dir,
        geometry: { bands: [{ pHigh: z.band.hi, pLow: z.band.lo }], anchorTimes: z.anchorIdx.map((x) => (bars[x] as Candle).time) },
        t_event: (bars[z.depStart] as Candle).time, known_at: known, confirmed_at: null,
        lifecycle: [{ kind: "fresh", t: known, known_at: known }, ...zoneLifecycle(bars, z.depEnd + 1, z.dir, z.band, sec)],
        ...(origin ? { origin_id: origin.id } : {}),
        grade: {
          significance: r2(w * Math.min(1, depAtr / S.fullDepartAtr)), relevance: null, quality: null, freshness: null,
          factors: [
            z.base
              ? { id: "base", label: `Base of ${nBase} bar${nBase > 1 ? "s" : ""} (bodies ≤ ${S.baseAtr} ATR)`, status: "supports" as const, value: nBase }
              : { id: "base", label: "No qualifying base before the departure", status: "opposes" as const },
            { id: "departure", label: `Departure ${depAtr.toFixed(1)} ATR in ${depLen} bar${depLen > 1 ? "s" : ""}`, status: "supports" as const, value: depAtr },
            ...(z.imbalance ? [{ id: "imbalance", label: "Departure left a fair value gap", status: "supports" as const }] : []),
            ...(tag ? [{ id: "order_block", label: "Order block: last opposite candle before the departure", status: "supports" as const }] : []),
            { id: "tf", label: `${ctx.tf} timeframe weight ${w}`, status: "supports" as const, value: w },
            location(),
          ],
        },
        provenance,
        evidence: [{
          t: (bars[z.depStart] as Candle).time,
          note: `${obOnly ? "Opposite-colour candle" : `Base of ${nBase} bar${nBase > 1 ? "s" : ""}`} at ${range} (${S.bounds} bounds) followed by a ${depAtr.toFixed(1)} ATR ${bull ? "upward" : "downward"} departure in ${depLen} bar${depLen > 1 ? "s" : ""}.`,
        }],
      });
    }
    return out;
  },
};