/** DESK DK5 — reference levels. D series → PDH/PDL/PDC · W series → PWH/PWL · base TF (H1) → day/week open,
 *  completed session highs/lows (UTC hours, "approx" until DK15) and round numbers (50-pip grid, known when first traded).
 *  Each level is superseded when its successor is known. Zero-height bands; neutral tone. */
import { dstShiftHours, type SessionName } from "@/desk/context/sessions";
import { objectId } from "@/desk/lib/ids";
import { DEFAULTS } from "@/desk/methodology/defaults";
import type { KernelResult } from "@/desk/kernel/kernel";
import type { AnalysisObject, LifecycleEvent } from "@/desk/types/schemas";
import { PAIR_META, TF_SECONDS, bucketStart, type Pair } from "@/types/market";
import type { DetectCtx, Detector } from "../registry";

const C = { PDH: 11, PDL: 12, PDC: 13, PWH: 14, PWL: 15, DAY_OPEN: 16, WEEK_OPEN: 17, SESSION: 30, ROUND: 40 };

interface Draft { anchors: number[]; price: number; label: string; note: string; t_event: number; known_at: number; sig: number; supersededAt: number | null }

function toObject(d: Draft, ctx: DetectCtx, approx = false): AnalysisObject {
  const life: LifecycleEvent[] = d.supersededAt === null ? [] : [{ kind: "superseded", t: d.supersededAt, known_at: d.supersededAt }];
  return {
    id: objectId({ type: "reference_level", pair: ctx.pair, tf: ctx.tf, anchorTimes: d.anchors }),
    type: "reference_level", layer: "levels", pair: ctx.pair, source_tf: ctx.tf,
    geometry: { bands: [{ pHigh: d.price, pLow: d.price }], anchorTimes: d.anchors },
    t_event: d.t_event, known_at: d.known_at, confirmed_at: null, lifecycle: life,
    grade: {
      significance: d.sig, relevance: null, quality: null, freshness: null,
      factors: [
        { id: "label", label: d.label, status: "supports" },
        ...(approx ? [{ id: "approx", label: "Approximate — DST-aware session hours (OQ-7 default); confirm in the methodology editor (DK17)", status: "unavailable" as const }] : []),
      ],
    },
    provenance: { rulesVersion: ctx.rulesVersion, dataKind: ctx.dataKind, detector: "reference", detectorVersion: 1 },
    evidence: [{ t: d.t_event, note: d.note }],
  };
}

/** Link each draft to its successor in the (time-ordered) list: superseded when the next is known. */
function chain(ds: Draft[]): Draft[] {
  for (let i = 0; i + 1 < ds.length; i++) ds[i]!.supersededAt = ds[i + 1]!.known_at;
  return ds;
}

function previous(k: KernelResult, ctx: DetectCtx, kinds: [string, number, (b: KernelResult["bars"][number]) => number][], word: string, sig: number): AnalysisObject[] {
  const sec = TF_SECONDS[ctx.tf];
  const out: AnalysisObject[] = [];
  for (const [label, code, pick] of kinds) {
    const ds: Draft[] = k.bars.map((b) => ({
      anchors: [b.time + sec, code], price: pick(b), label, t_event: b.time + sec, known_at: b.time + sec, sig, supersededAt: null,
      note: `${label}: the ${label.endsWith("C") ? "close" : label.endsWith("H") ? "high" : "low"} of the prior ${word}, known once that bar closed.`,
    }));
    // successor = the next bar's level, known when that bar closes
    for (let i = 0; i < ds.length; i++) {
      const nb = k.bars[i + 1];
      ds[i]!.supersededAt = nb ? nb.time + sec : null;
    }
    out.push(...ds.map((d) => toObject(d, ctx)));
  }
  return out;
}

function opens(k: KernelResult, ctx: DetectCtx, sig: number): AnalysisObject[] {
  const sec = TF_SECONDS[ctx.tf];
  const out: AnalysisObject[] = [];
  for (const [tf, label, code] of [["D", "Day open", C.DAY_OPEN], ["W", "Week open", C.WEEK_OPEN]] as const) {
    const ds: Draft[] = [];
    let prev = NaN;
    for (const b of k.bars) {
      const bs = bucketStart(tf, b.time);
      if (bs === prev) continue;
      prev = bs;
      ds.push({ anchors: [b.time, code], price: b.open, label, t_event: b.time, known_at: b.time + sec, sig, supersededAt: null,
        note: `${label}: first ${ctx.tf} bar open of the ${tf === "D" ? "day" : "week"} (22:00 UTC roll).` });
    }
    out.push(...chain(ds).map((d) => toObject(d, ctx)));
  }
  return out;
}

function sessions(k: KernelResult, ctx: DetectCtx, sessions: Record<string, readonly number[]>, sig: number, dst: boolean): AnalysisObject[] {
  const sec = TF_SECONDS[ctx.tf];
  const last = k.bars[k.bars.length - 1];
  if (!last) return [];
  const lastClose = last.time + sec;
  const names = Object.keys(sessions);
  const out: AnalysisObject[] = [];
  names.forEach((name, idx) => {
    const [s0, e0] = sessions[name] as [number, number];
    /** Per-day window: the UTC hours shift with DST (London/NY) so the session stays at the same local time. */
    const win = (day: number): [number, number] => { const sh = dst ? dstShiftHours(name as SessionName, day * 86400) : 0; return [s0 + sh, e0 + sh]; };
    const byDay = new Map<number, { hi: number; lo: number; hiT: number; loT: number }>();
    for (const b of k.bars) {
      const day = Math.floor(b.time / 86400);
      const h = Math.floor((b.time % 86400) / 3600);
      const [s, e] = win(day);
      if (h < s || h >= e) continue;
      const cur = byDay.get(day);
      if (!cur) byDay.set(day, { hi: b.high, lo: b.low, hiT: b.time, loT: b.time });
      else {
        if (b.high > cur.hi) { cur.hi = b.high; cur.hiT = b.time; }
        if (b.low < cur.lo) { cur.lo = b.low; cur.loT = b.time; }
      }
    }
    const nm = name[0]!.toUpperCase() + name.slice(1);
    for (const side of ["high", "low"] as const) {
      const ds: Draft[] = [];
      for (const [day, v] of [...byDay.entries()].sort((a, b) => a[0] - b[0])) {
        const [s, e] = win(day);
        const done = day * 86400 + e * 3600;
        if (done > lastClose) continue;
        const t0 = day * 86400 + s * 3600;
        ds.push({
          anchors: [t0, C.SESSION + idx * 2 + (side === "high" ? 0 : 1)], price: side === "high" ? v.hi : v.lo,
          label: `${nm} ${side} (approx)`, t_event: side === "high" ? v.hiT : v.loT, known_at: done, sig, supersededAt: null,
          note: `${nm} session ${side} (${String(s).padStart(2, "0")}–${String(e).padStart(2, "0")} UTC${dst ? ", DST-aware" : ""}, approximate), known once the session ended.`,
        });
      }
      out.push(...chain(ds).map((d) => toObject(d, ctx, true)));
    }
  });
  return out;
}

function rounds(k: KernelResult, ctx: DetectCtx, pips: number, sig: number): AnalysisObject[] {
  const meta = PAIR_META[ctx.pair as Pair];
  const step = pips * meta.pip;
  const sec = TF_SECONDS[ctx.tf];
  const seen = new Set<number>();
  const out: AnalysisObject[] = [];
  let lo = Infinity;
  let hi = -Infinity;
  for (const b of k.bars) {
    if (b.low >= lo && b.high <= hi) continue;
    lo = Math.min(lo, b.low); hi = Math.max(hi, b.high);
    for (let n = Math.ceil(lo / step - 1e-9); n <= Math.floor(hi / step + 1e-9); n++) {
      if (seen.has(n)) continue;
      seen.add(n);
      const price = Number((n * step).toFixed(meta.decimals));
      out.push(toObject({
        anchors: [b.time + sec, C.ROUND, Math.round(price / meta.pip * 10)], price, label: `Round ${price.toFixed(meta.decimals)}`,
        note: `Round number on a ${pips}-pip grid; first traded here at the close of this bar.`,
        t_event: b.time + sec, known_at: b.time + sec, sig, supersededAt: null,
      }, ctx));
    }
  }
  return out;
}

export const referenceDetector: Detector = {
  id: "reference",
  version: 1,
  run(k, ctx) {
    const cfg = ctx.cfg ?? DEFAULTS;
    const R = cfg.reference;
    const w = cfg.levels.tfWeight[ctx.tf];
    if (ctx.tf === "D") {
      return previous(k, ctx, [["PDH", C.PDH, (b) => b.high], ["PDL", C.PDL, (b) => b.low], ["PDC", C.PDC, (b) => b.close]], "day", w);
    }
    if (ctx.tf === "W") {
      return previous(k, ctx, [["PWH", C.PWH, (b) => b.high], ["PWL", C.PWL, (b) => b.low]], "week", w);
    }
    if (ctx.tf !== R.baseTf) return [];
    return [
      ...opens(k, ctx, R.significance.open),
      ...sessions(k, ctx, R.sessions, R.significance.session, R.sessionsDst),
      ...rounds(k, ctx, R.roundPips, R.significance.round),
    ];
  },
};