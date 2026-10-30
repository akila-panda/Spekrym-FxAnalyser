/** DESK DK3 — detector registry + memoised pipeline: closedBars → kernel → detectors.
 *  Memo key: (pair, tf, asOfBucket, methodHash, dataVersion, detector ids/versions). Detectors are pure and DOM-free. */
import { canonicalHash, rulesVersion } from "@/desk/lib/hash";
import { DEFAULTS } from "@/desk/methodology/defaults";
import { runKernel, type KernelResult } from "@/desk/kernel/kernel";
import type { AnalysisObject } from "@/desk/types/schemas";
import { TF_SECONDS, type Candle, type Pair, type Timeframe } from "@/types/market";

export interface DetectCtx {
  pair: Pair;
  tf: Timeframe;
  asOf: number;
  dataKind: "sample" | "live";
  rulesVersion: string;
  /** Methodology in force (defaults when omitted). */
  cfg?: typeof DEFAULTS;
}

export interface Detector {
  id: string;
  version: number;
  run: (k: KernelResult, ctx: DetectCtx, prior?: readonly AnalysisObject[]) => AnalysisObject[];
}

export interface DetectInput {
  candles: readonly Candle[];
  pair: Pair;
  tf: Timeframe;
  /** UTC seconds; Infinity = latest closed bar. */
  asOf: number;
  dataKind: "sample" | "live";
  /** Changes whenever the candles change (e.g. `${length}:${lastTime}`). */
  dataVersion: string;
}

export interface DetectResult {
  objects: AnalysisObject[];
  /** Last closed close / ATR on this TF (null when no closed bar / warm-up). */
  price: number | null;
  atr: number | null;
  /** Time (UTC s) the latest closed bar ended; null when none. */
  lastClose: number | null;
}

const detectors = new Map<string, Detector>();
const cache = new Map<string, DetectResult>();
const MAX_CACHE = 64;

export function registerDetector(d: Detector): void {
  detectors.set(d.id, d);
  cache.clear();
}
export const listDetectors = (): Detector[] => [...detectors.values()];
export const clearDetectCache = (): void => cache.clear();

const bucket = (tf: Timeframe, asOf: number): string =>
  Number.isFinite(asOf) ? String(Math.floor(asOf / TF_SECONDS[tf])) : "inf";

export function detectAll(i: DetectInput, cfg: typeof DEFAULTS = DEFAULTS): DetectResult {
  const rv = rulesVersion(cfg);
  const dets = [...detectors.values()].map((d) => `${d.id}@${d.version}`).join(",");
  const key = [i.pair, i.tf, bucket(i.tf, i.asOf), canonicalHash(cfg), i.dataVersion, i.dataKind, dets].join("|");
  const hit = cache.get(key);
  if (hit) return hit;

  const k = runKernel(i.candles, { pair: i.pair, tf: i.tf, asOf: i.asOf }, cfg);
  const ctx: DetectCtx = { pair: i.pair, tf: i.tf, asOf: i.asOf, dataKind: i.dataKind, rulesVersion: rv, cfg };
  const seen = new Set<string>();
  const objects: AnalysisObject[] = [];
  for (const d of detectors.values()) {
    for (const o of d.run(k, ctx, objects)) {
      if (seen.has(o.id)) continue;
      seen.add(o.id);
      objects.push(o);
    }
  }
  objects.sort((a, b) => a.known_at - b.known_at || (a.id < b.id ? -1 : 1));
  const last = k.bars[k.bars.length - 1];
  const res: DetectResult = {
    objects,
    price: last ? last.close : null,
    atr: k.atr[k.atr.length - 1] ?? null,
    lastClose: last ? last.time + TF_SECONDS[i.tf] : null,
  };
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value as string);
  cache.set(key, res);
  return res;
}