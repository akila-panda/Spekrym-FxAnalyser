/** DESK DK8 — fair value gaps (3-bar imbalance). Bull: bar1.high < bar3.low; bear: bar1.low > bar3.high.
 *  Gap must be ≥ minAtr × ATR (ATR at bar 3). Band is frozen at formation; later facts are lifecycle events:
 *  open → partially_filled (wick enters) → filled (rule: wick | close, far edge) → invalidated (close beyond far edge)
 *  → inverted (retest from beyond the far edge that closes back beyond it). Filled / invalidated / inverted are separate.
 *  Causal: known_at = close of bar 3; every event known_at = close of the bar it happened on. */
import { objectId } from "@/desk/lib/ids";
import { DEFAULTS } from "@/desk/methodology/defaults";
import type { AnalysisObject, LifecycleEvent } from "@/desk/types/schemas";
import { PAIR_META, TF_SECONDS, type Candle } from "@/types/market";
import type { Detector } from "../registry";

/** Lifecycle of one gap, scanned forward from the bar after bar 3. Bear gaps are mirrored (prices negated) so one path serves both. */
function lifecycle(bars: readonly Candle[], from: number, s: 1 | -1, lo: number, hi: number, rule: "wick" | "close", sec: number): LifecycleEvent[] {
  const gLo = s > 0 ? lo : -hi;
  const gHi = s > 0 ? hi : -lo;
  const size = gHi - gLo;
  const life: LifecycleEvent[] = [];
  let entered = false, filled = false, invalid = false;
  for (let j = from; j < bars.length; j++) {
    const b = bars[j] as Candle;
    const low = s > 0 ? b.low : -b.high;
    const high = s > 0 ? b.high : -b.low;
    const close = s * b.close;
    const t = b.time + sec;
    const ev = (kind: string, detail?: Record<string, number>): void => { life.push({ kind, t, known_at: t, ...(detail ? { detail } : {}) }); };
    if (invalid) {
      if (high > gLo && close < gLo) { ev("inverted"); return life; }
      continue;
    }
    const isFilled = rule === "wick" ? low <= gLo : close <= gLo;
    if (!entered && (low < gHi || isFilled)) {
      entered = true;
      ev("partially_filled", { depth: Math.round(Math.min(1, (gHi - Math.max(low, gLo)) / size) * 100) / 100 });
    }
    if (!filled && isFilled) { filled = true; ev("filled"); }
    if (close < gLo) { invalid = true; ev("invalidated", { close: b.close }); }
  }
  return life;
}

export const fvgDetector: Detector = {
  id: "fvg",
  version: 1,
  run(k, ctx) {
    const cfg = ctx.cfg ?? DEFAULTS;
    const F = cfg.fvg;
    const sec = TF_SECONDS[ctx.tf];
    const meta = PAIR_META[ctx.pair];
    const w = cfg.levels.tfWeight[ctx.tf];
    const bars = k.bars;
    const dispAt = new Map<number, (typeof k.displacements)[number]>();
    for (const d of k.displacements) for (let x = d.startIndex; x <= d.endIndex; x++) dispAt.set(x, d);
    const provenance = { rulesVersion: ctx.rulesVersion, dataKind: ctx.dataKind, detector: "fvg", detectorVersion: 1 };
    const out: AnalysisObject[] = [];
    for (let i = 2; i < bars.length; i++) {
      const a = bars[i - 2] as Candle, b = bars[i - 1] as Candle, c = bars[i] as Candle;
      const at = k.atr[i];
      if (at == null || at <= 0) continue;
      const bull = a.high < c.low;
      const bear = a.low > c.high;
      if (!bull && !bear) continue;
      const lo = bull ? a.high : c.high;
      const hi = bull ? c.low : a.low;
      const size = hi - lo;
      if (size < F.minAtr * at) continue;
      const known = c.time + sec;
      const ce = (lo + hi) / 2;
      const sizeAtr = size / at;
      const d = dispAt.get(i - 1);
      const origin = d && d.endIndex <= i ? d : undefined; // only if the displacement was already knowable at known_at
      const life = [{ kind: "open", t: known, known_at: known } as LifecycleEvent, ...lifecycle(bars, i + 1, bull ? 1 : -1, lo, hi, F.fillRule, sec)];
      out.push({
        id: objectId({ type: "fvg", pair: ctx.pair, tf: ctx.tf, anchorTimes: [b.time] }),
        type: "fvg", layer: "fvg", pair: ctx.pair, source_tf: ctx.tf, direction: bull ? "bull" : "bear",
        geometry: { bands: [{ pHigh: hi, pLow: lo }], points: [{ t: b.time, p: ce }], anchorTimes: [b.time] },
        t_event: b.time, known_at: known, confirmed_at: null, lifecycle: life,
        ...(origin ? { origin_id: origin.id } : {}),
        grade: {
          significance: Math.round(w * Math.min(1, sizeAtr / F.fullSizeAtr) * 100) / 100,
          relevance: null, quality: null, freshness: null,
          factors: [
            { id: "size", label: `Gap ${(size / meta.pip).toFixed(1)} pips · ${sizeAtr.toFixed(1)} ATR`, status: "supports", value: sizeAtr },
            { id: "ce", label: `Consequent encroachment ${ce.toFixed(meta.decimals)}`, status: "supports", value: ce },
            { id: "tf", label: `${ctx.tf} timeframe weight ${w}`, status: "supports", value: w },
            ...(origin ? [{ id: "displacement", label: `Formed within a ${origin.magnitudeAtr.toFixed(1)} ATR displacement`, status: "supports" as const, value: origin.magnitudeAtr }] : []),
          ],
        },
        provenance,
        evidence: [{ t: b.time, note: `Bar 1 ${bull ? "high" : "low"} ${(bull ? a.high : a.low).toFixed(meta.decimals)} and bar 3 ${bull ? "low" : "high"} ${(bull ? c.low : c.high).toFixed(meta.decimals)} leave an unfilled gap of ${(size / meta.pip).toFixed(1)} pips.` }],
      });
    }
    return out;
  },
};