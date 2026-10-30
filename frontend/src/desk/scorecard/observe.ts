/** DESK DK19 — observations. Pure: for one pair, turns full-history detections + kernels into one row per object per metric.
 *  Every outcome reads only bars after the fact's known_at inside a window that must be fully observable (right-censoring:
 *  objects whose window passes the data end are excluded, never counted as failures). See docs/DK19_PROTOCOL.md. */
import { dstShiftHours, type SessionName } from "@/desk/context/sessions";
import { buildRelations } from "@/desk/detect/relations";
import type { KernelResult } from "@/desk/kernel/kernel";
import type { DEFAULTS } from "@/desk/methodology/defaults";
import type { AnalysisObject } from "@/desk/types/schemas";
import { TF_SECONDS, type Candle, type Pair, type Timeframe } from "@/types/market";
import { FILL_HORIZON_BARS, type MetricId } from "./protocol";

type Cfg = typeof DEFAULTS;
export type SessionKey = "asia" | "london" | "ny" | "overlap" | "off";
export interface Obs {
  id: string; metric: MetricId; pair: Pair; tf: Timeframe; type: "fvg" | "sd_zone" | "sweep";
  direction: "bull" | "bear" | null; session: SessionKey; cohort: "nested" | "single" | null; success: boolean; t: number;
}
export interface TfData { tf: Timeframe; objects: readonly AnalysisObject[]; kernel: KernelResult }

/** Session at UTC time t, from the methodology's (approx, DST-aware) UTC hour ranges. */
export function sessionOf(t: number, cfg: Cfg): SessionKey {
  const day = Math.floor(t / 86400);
  const h = (t - day * 86400) / 3600;
  const R = cfg.reference;
  const active = Object.entries(R.sessions).filter(([name, r]) => {
    const sh = R.sessionsDst ? dstShiftHours(name as SessionName, day * 86400) : 0;
    return h >= (r[0] as number) + sh && h < (r[1] as number) + sh;
  }).map(([name]) => name);
  if (active.length === 0) return "off";
  if (active.length > 1) return "overlap";
  return active[0] as SessionKey;
}

const ENTRY: Record<string, string> = { fvg: "partially_filled", sd_zone: "partially_mitigated" };

function reacted(bars: readonly Candle[], atr: (number | null)[], idx: number, o: AnalysisObject, cfg: Cfg): boolean | null {
  const L = cfg.levels;
  if (idx < 0 || idx + L.reactBars >= bars.length) return null;
  const a = atr[idx];
  const band = o.geometry.bands[0];
  if (a == null || a <= 0 || !band || !o.direction) return null;
  const s = o.direction === "bull" ? 1 : -1;
  const gLo = s > 0 ? band.pLow : -band.pHigh;
  const gHi = s > 0 ? band.pHigh : -band.pLow;
  for (let j = idx + 1; j <= idx + L.reactBars; j++) {
    const b = bars[j] as Candle;
    if (s * b.close < gLo) return false;
    if ((s > 0 ? b.high : -b.low) - gHi >= L.reactAtr * a) return true;
  }
  return false;
}

export function observePair(pair: Pair, data: readonly TfData[], cfg: Cfg): Obs[] {
  const relations = buildRelations(data.flatMap((d) => d.objects));
  const nestedAt = new Map<string, number>();
  for (const r of relations) if (r.kind === "nested") nestedAt.set(r.bId, Math.min(nestedAt.get(r.bId) ?? Infinity, r.known_at));
  const out: Obs[] = [];
  for (const { tf, objects, kernel } of data) {
    const bars = kernel.bars;
    if (bars.length === 0) continue;
    const sec = TF_SECONDS[tf];
    const lastClose = (bars[bars.length - 1] as Candle).time + sec;
    const idxByClose = new Map(bars.map((b, i) => [b.time + sec, i] as const));
    const idxByOpen = new Map(bars.map((b, i) => [b.time, i] as const));
    for (const o of objects) {
      if (o.type !== "fvg" && o.type !== "sd_zone" && o.type !== "sweep") continue;
      const base = { id: "", pair, tf, type: o.type, direction: (o.direction === "bull" || o.direction === "bear" ? o.direction : null), cohort: null as Obs["cohort"] };
      const push = (metric: MetricId, t: number, success: boolean, cohort: Obs["cohort"] = null): void => {
        out.push({ ...base, id: `${o.id}|${metric}`, metric, session: sessionOf(t, cfg), cohort, success, t });
      };
      if (o.type === "fvg" && o.known_at + FILL_HORIZON_BARS * sec <= lastClose) {
        const limit = o.known_at + FILL_HORIZON_BARS * sec;
        push("fvgFill", o.known_at, o.lifecycle.some((e) => e.kind === "filled" && e.known_at <= limit));
      }
      if (o.type === "fvg" || o.type === "sd_zone") {
        const entry = o.lifecycle.find((e) => e.kind === ENTRY[o.type]);
        const r = entry ? reacted(bars, kernel.atr, idxByClose.get(entry.t) ?? -1, o, cfg) : null;
        if (entry && r !== null) push("reaction", entry.known_at, r, (nestedAt.get(o.id) ?? Infinity) <= entry.known_at ? "nested" : "single");
      }
      if (o.type === "sweep" && o.direction) {
        const idx = idxByOpen.get(o.t_event);
        const F = cfg.liquidity.followBars;
        if (idx !== undefined && idx + F < bars.length) {
          const win = kernel.displacements.filter((d) => d.startIndex > idx && d.startIndex <= idx + F);
          push("sweepOpposite", o.known_at, win.some((d) => d.direction === o.direction));
          push("sweepSame", o.known_at, win.some((d) => d.direction !== o.direction));
        }
      }
    }
  }
  return out;
}