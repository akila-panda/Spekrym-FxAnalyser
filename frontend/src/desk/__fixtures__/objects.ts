/** DESK DK3 — tiny AnalysisObject factory for tests. */
import type { AnalysisObject } from "@/desk/types/schemas";

let n = 0;
export function mkObj(o: Partial<AnalysisObject> & { lo?: number; hi?: number } = {}): AnalysisObject {
  const { lo = 1.1, hi = 1.101, ...rest } = o;
  const t = 1_735_689_600 + (n += 3600);
  const type = rest.type ?? "sd_zone";
  const tf = rest.source_tf ?? "H1";
  return {
    id: `${type}:EUR_USD:${tf}:${t}`, type, layer: "supplyDemand", pair: "EUR_USD", source_tf: tf,
    geometry: { bands: [{ pHigh: hi, pLow: lo }], anchorTimes: [t] },
    t_event: t, known_at: t + 3600, confirmed_at: null, lifecycle: [], evidence: [],
    provenance: { rulesVersion: "rtest", dataKind: "sample", detector: "test", detectorVersion: 1 },
    ...rest,
  } as AnalysisObject;
}