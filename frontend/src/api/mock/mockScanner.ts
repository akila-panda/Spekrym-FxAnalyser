/** DEV ONLY. Produces correctly *shaped* scan results from the mock candles.
 *  The trading logic is deliberately simplistic and is not a real strategy.
 *  Output is built in backend wire format and validated by parseScanResult. */
import { pipSize } from "@/lib/pips";
import { floorTo, parseBackendTs, utcDateString } from "@/lib/time";
import { parseHM, windowOnDate } from "@/lib/tz";
import { PAIR_META, TF_SECONDS, type Candle, type Pair, type Timeframe } from "@/types/market";
import { parseScanResult, type ParamValue, type ScanRequest, type ScanResult, type StrategyDef } from "@/types";
import { ApiError } from "../client";
import type { Dataset } from "./generateCandles";
import { MOCK_STRATEGIES } from "./mockStrategies";

type Wire = Record<string, unknown>;
type Dir = "long" | "short";
interface Made {
  wire: Wire;
  valid: boolean;
  r: number;
  result?: "win" | "loss" | "flat";
}
interface Ctx {
  pair: Pair;
  tf: Timeframe;
  tfSec: number;
  pip: number;
  dec: number;
  bars: Candle[];
  ds: Dataset;
  p: Record<string, ParamValue>;
  maxT: number;
}

export const MOCK_COST_PIPS = 1.6;

const fmtTs = (sec: number) => new Date(sec * 1000).toISOString().slice(0, 19).replace("T", " ") + "+00:00";
const at = <T,>(a: readonly T[], i: number): T => {
  const v = a[i];
  if (v === undefined) throw new Error(`index ${i} out of range`);
  return v;
};
const r2 = (x: number) => Math.round(x * 100) / 100;

function lowerBound(bars: readonly Candle[], t: number): number {
  let lo = 0;
  let hi = bars.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (at(bars, mid).time < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
const slice = (bars: readonly Candle[], a: number, b: number) => bars.slice(lowerBound(bars, a), lowerBound(bars, b));
const lastBefore = (bars: readonly Candle[], t: number) => bars[lowerBound(bars, t) - 1];

// ---------- params ----------
export function resolveParams(def: StrategyDef, given: Record<string, ParamValue>): Record<string, ParamValue> {
  const bad = (m: string): never => {
    throw new ApiError("http", m, 422);
  };
  const keys = new Set(def.params.map((x) => x.key));
  for (const k of Object.keys(given)) if (!keys.has(k)) bad(`Unknown param "${k}"`);
  const out: Record<string, ParamValue> = {};
  for (const d of def.params) {
    const v = given[d.key] ?? d.default;
    if (d.type === "number" || d.type === "integer") {
      if (typeof v !== "number" || !Number.isFinite(v)) bad(`Param "${d.key}" must be a number`);
      const n = v as number;
      if (d.type === "integer" && !Number.isInteger(n)) bad(`Param "${d.key}" must be an integer`);
      if (d.min !== undefined && n < d.min) bad(`Param "${d.key}" must be >= ${d.min}`);
      if (d.max !== undefined && n > d.max) bad(`Param "${d.key}" must be <= ${d.max}`);
    } else if (d.type === "boolean") {
      if (typeof v !== "boolean") bad(`Param "${d.key}" must be true or false`);
    } else if (d.type === "select") {
      if (typeof v !== "string" || !d.options.includes(v)) bad(`Param "${d.key}" must be one of ${d.options.join(", ")}`);
    } else if (typeof v !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) {
      bad(`Param "${d.key}" must be HH:MM`);
    }
    out[d.key] = v;
  }
  return out;
}

function rangeBound(s: string, end: boolean): number {
  try {
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return parseBackendTs(`${s}T00:00:00Z`) + (end ? 86399 : 0);
    return parseBackendTs(s);
  } catch {
    throw new ApiError("http", `Bad date "${s}"`, 422);
  }
}

// ---------- shared pieces ----------
function ann(id: string, kind: string, role: string, tone: string, source_tf: Timeframe, step: number, known: number, extra: Wire): Wire {
  return { id, kind, role, tone, source_tf, step, known_at: fmtTs(known), emphasis: "normal", ...extra };
}

function simulate(c: Ctx, from: number, dir: Dir, entry: number, stop: number, target: number, endSec: number, entryKnown: number) {
  let held = 0;
  let last: Candle | undefined;
  for (let i = from; i < c.bars.length; i++) {
    const b = at(c.bars, i);
    if (b.time >= endSec) break;
    held++;
    last = b;
    const hitStop = dir === "long" ? b.low <= stop : b.high >= stop;
    const hitTarget = dir === "long" ? b.high >= target : b.low <= target;
    if (hitStop) return { exitTime: b.time + c.tfSec, exitPrice: stop, reason: "stop", held };
    if (hitTarget) return { exitTime: b.time + c.tfSec, exitPrice: target, reason: "target", held };
  }
  if (last) return { exitTime: last.time + c.tfSec, exitPrice: last.close, reason: "session_end", held };
  return { exitTime: entryKnown + c.tfSec, exitPrice: entry, reason: "session_end", held: 0 };
}

function finishTrade(
  c: Ctx, id: string, a: { step: number; dir: Dir; entry: number; stop: number; target: number; t0: number },
  sim: ReturnType<typeof simulate>, anns: Wire[],
): { outcome: Wire; r: number; result: "win" | "loss" | "flat"; exitTime: number } {
  const gross = ((sim.exitPrice - a.entry) / c.pip) * (a.dir === "long" ? 1 : -1);
  const net = gross - MOCK_COST_PIPS;
  const risk = Math.abs(a.entry - a.stop) / c.pip;
  const r = r2(net / risk);
  const result = sim.reason === "session_end" && Math.abs(r) < 0.05 ? "flat" : r > 0 ? "win" : "loss";
  const rd = (x: number) => Number(x.toFixed(c.dec));
  anns.push(
    ann(`${id}:trade`, "trade", "entry", a.dir === "long" ? "bull" : "bear", c.tf, a.step, a.t0, {
      label: `${r > 0 ? "+" : ""}${r}R`,
      why: `Exit: ${sim.reason}`,
      emphasis: "strong",
      t0: fmtTs(a.t0),
      t1: fmtTs(sim.exitTime),
      direction: a.dir,
      entry: rd(a.entry),
      stop: rd(a.stop),
      target: rd(a.target),
      exit_time: fmtTs(sim.exitTime),
      exit_price: rd(sim.exitPrice),
    }),
  );
  return {
    outcome: { result, r_multiple: r, net_pips: r2(net), cost_pips: MOCK_COST_PIPS, exit_reason: sim.reason, bars_held: sim.held },
    r,
    result,
    exitTime: sim.exitTime,
  };
}

interface Builder {
  steps: Wire[];
  anns: Wire[];
  conds: Wire[];
  step: (label: string, known: number) => number;
  cond: (key: string, label: string, passed: boolean | null, detail: string) => void;
}
function builder(): Builder {
  const steps: Wire[] = [];
  const conds: Wire[] = [];
  return {
    steps,
    anns: [],
    conds,
    step: (label, known) => {
      steps.push({ n: steps.length + 1, label, known_at: fmtTs(known) });
      return steps.length;
    },
    cond: (key, label, passed, detail) => conds.push({ key, label, passed, detail }),
  };
}

function setupWire(id: string, date: string, b: Builder, focus: [number, number], dir?: Dir, outcome?: Wire): Wire {
  return {
    id,
    status: outcome ? "valid" : "rejected",
    direction: dir ?? null,
    date,
    focus: { from: fmtTs(focus[0]), to: fmtTs(focus[1]) },
    steps: b.steps,
    conditions: b.conds,
    annotations: b.anns,
    outcome: outcome ?? null,
  };
}

const rejected = (c: Ctx, id: string, date: string, b: Builder, from: number, to: number, dir?: Dir): Made[] => [
  { wire: setupWire(id, date, b, [from, Math.min(to, c.maxT)], dir), valid: false, r: 0 },
];

// ---------- ORB (mock) ----------
function orbDay(c: Ctx, date: string, day: number): Made[] {
  const { bars, tfSec, tf, pip, p, ds } = c;
  const hm = parseHM(String(p.session_open));
  const openT = day + (hm.hour * 60 + hm.minute) * 60;
  const rangeEnd = openT + Math.max(Number(p.range_min) * 60, tfSec);
  const winEnd = rangeEnd + Number(p.entry_window_min) * 60;
  const sessEnd = openT + 540 * 60;
  const i0 = lowerBound(bars, openT);
  const i1 = lowerBound(bars, rangeEnd);
  if (i1 <= i0 || at(bars, i0).time >= rangeEnd) return [];
  let hi = -Infinity;
  let lo = Infinity;
  for (let i = i0; i < i1; i++) {
    hi = Math.max(hi, at(bars, i).high);
    lo = Math.min(lo, at(bars, i).low);
  }
  const width = hi - lo;
  const widthPips = width / pip;
  const id = `orb-${date}-${tf}`;
  const b = builder();
  const cl = (t: number) => Math.min(t, c.maxT);
  const focusFrom = openT - 5 * 60;

  const s1 = b.step("Range forms", rangeEnd);
  const s2 = b.step("Window opens", rangeEnd);
  // context from higher timeframes (step 0)
  const prev = slice(ds.H1, openT - 86400, openT);
  if (prev.length) {
    const ph = Math.max(...prev.map((x) => x.high));
    const pl = Math.min(...prev.map((x) => x.low));
    const t0 = at(prev, 0).time;
    b.anns.push(ann(`${id}:prior_high`, "level", "liquidity", "info", "H1", 0, openT, { label: "Prior 24h high", price: ph, t0: fmtTs(t0), t1: fmtTs(cl(sessEnd)) }));
    b.anns.push(ann(`${id}:prior_low`, "level", "liquidity", "info", "H1", 0, openT, { label: "Prior 24h low", price: pl, t0: fmtTs(t0), t1: fmtTs(cl(sessEnd)) }));
  }
  const h1 = lastBefore(ds.H1, openT);
  if (h1) {
    b.anns.push(ann(`${id}:h1_bias`, "level", "bias", h1.close >= h1.open ? "bull" : "bear", "H1", 0, h1.time + 3600, {
      label: "H1 bias", why: "Close of the last H1 bar before the open.", price: h1.close, t0: fmtTs(h1.time), t1: fmtTs(cl(sessEnd)),
    }));
  }
  const h4 = lastBefore(ds.H4, openT);
  if (h4) {
    b.anns.push(ann(`${id}:h4_close`, "level", "context", "neutral", "H4", 0, h4.time + 14400, {
      label: "H4 close", price: h4.close, t0: fmtTs(h4.time), t1: fmtTs(cl(sessEnd)),
    }));
  }
  // range and window
  b.anns.push(ann(`${id}:range`, "zone", "range", "neutral", tf, s1, rangeEnd, {
    label: `Range ${widthPips.toFixed(1)}p`, why: `High/low of the first ${Number(p.range_min)} min.`,
    t0: fmtTs(openT), t1: fmtTs(rangeEnd), p_high: hi, p_low: lo,
  }));
  for (const [k, price, label] of [["range_high", hi, "Range high"], ["range_low", lo, "Range low"]] as const) {
    b.anns.push(ann(`${id}:${k}`, "level", "range", "neutral", tf, s1, rangeEnd, { label, price, t0: fmtTs(rangeEnd), t1: fmtTs(cl(winEnd)) }));
  }
  b.anns.push(ann(`${id}:window`, "window", "window", "neutral", tf, s2, rangeEnd, {
    label: "Entry window", flow: "down", t0: fmtTs(rangeEnd), t1: fmtTs(cl(winEnd)),
  }));

  b.cond("range_formed", "Opening range formed", true, `${i1 - i0} bars, ${widthPips.toFixed(1)} pips`);
  const minS = Number(p.min_stop_pips);
  const maxS = Number(p.max_stop_pips);
  const sizeOk = widthPips >= minS && widthPips <= maxS;
  b.cond("range_size", "Range size within limits", sizeOk, sizeOk ? `${widthPips.toFixed(1)} pips` : `${widthPips.toFixed(1)} pips outside [${minS}, ${maxS}]`);
  if (!sizeOk) return rejected(c, id, date, b, focusFrom, winEnd);

  let j = i1;
  let up = false;
  let found = false;
  for (; j < bars.length && at(bars, j).time < winEnd; j++) {
    const k = at(bars, j).close;
    if (k > hi || k < lo) {
      up = k > hi;
      found = true;
      break;
    }
  }
  b.cond("breakout", "Close outside the range in the window", found, found ? `${up ? "above" : "below"} the range` : "no close outside the range");
  if (!found) return rejected(c, id, date, b, focusFrom, winEnd);

  const bar = at(bars, j);
  const known = bar.time + tfSec;
  const dir: Dir = (p.mode === "fade" ? !up : up) ? "long" : "short";
  const s3 = b.step("Breakout", known);
  b.anns.push(ann(`${id}:breakout`, "marker", "structure", dir === "long" ? "bull" : "bear", tf, s3, known, {
    label: "Breakout", t0: fmtTs(bar.time), price: up ? bar.high : bar.low, shape: up ? "arrow_up" : "arrow_down",
  }));

  let vwapOk: boolean | null = null;
  let vwapDetail = "Not used";
  if (p.use_vwap === true) {
    let pv = 0;
    let vv = 0;
    const pts: Wire[] = [];
    for (let i = i0; i <= j; i++) {
      const x = at(bars, i);
      pv += ((x.high + x.low + x.close) / 3) * x.volume;
      vv += x.volume;
      pts.push({ t: fmtTs(x.time), p: Number((pv / vv).toFixed(c.dec)) });
    }
    const vwap = Number((at(pts, pts.length - 1) as { p: number }).p);
    b.anns.push(ann(`${id}:vwap`, "polyline", "filter", "info", tf, s3, known, { label: "VWAP", points: pts }));
    vwapOk = dir === "long" ? bar.close > vwap : bar.close < vwap;
    vwapDetail = `close ${bar.close} vs VWAP ${vwap}`;
  }
  b.cond("vwap", "VWAP filter", vwapOk, vwapDetail);
  let volOk: boolean | null = null;
  let volDetail = "Not used";
  if (p.use_volume === true) {
    const prevBars = bars.slice(Math.max(0, j - 20), j);
    const avg = prevBars.reduce((s, x) => s + x.volume, 0) / Math.max(1, prevBars.length);
    volOk = bar.volume >= 1.5 * avg;
    volDetail = `${bar.volume} vs 1.5 x ${avg.toFixed(0)}`;
  }
  b.cond("volume", "Volume filter", volOk, volDetail);
  if (vwapOk === false || volOk === false) return rejected(c, id, date, b, focusFrom, winEnd, dir);

  const entry = bar.close;
  const stop = dir === "long" ? entry - width : entry + width;
  const target = dir === "long" ? entry + Number(p.target_mult) * width : entry - Number(p.target_mult) * width;
  const s4 = b.step("Entry", known);
  const sim = simulate(c, j + 1, dir, entry, stop, target, sessEnd, known);
  const fin = finishTrade(c, id, { step: s4, dir, entry, stop, target, t0: known }, sim, b.anns);
  return [{ wire: setupWire(id, date, b, [focusFrom, cl(fin.exitTime + 30 * 60)], dir, fin.outcome), valid: true, r: fin.r, result: fin.result }];
}

// ---------- Silver Bullet (mock) ----------
const SB_WINDOWS = {
  london: { label: "London open", s: "03:00", e: "04:00" },
  ny_am: { label: "NY AM", s: "10:00", e: "11:00" },
  ny_pm: { label: "NY PM", s: "14:00", e: "15:00" },
} as const;

function sbDay(c: Ctx, date: string): Made[] {
  const sel = String(c.p.window);
  const keys = (sel === "all" ? ["london", "ny_am", "ny_pm"] : [sel]) as (keyof typeof SB_WINDOWS)[];
  return keys.flatMap((k) => sbWindow(c, date, k));
}

function sbWindow(c: Ctx, date: string, key: keyof typeof SB_WINDOWS): Made[] {
  const { bars, tfSec, tf, pip, p, ds } = c;
  const w = SB_WINDOWS[key];
  const { start: ws, end: we } = windowOnDate(date, w.s, w.e, "America/New_York");
  const w0 = lowerBound(bars, ws);
  const w1 = lowerBound(bars, we);
  const liq = slice(ds.H1, ws - 3 * 3600, ws);
  if (w1 <= w0 || w0 < 3 || !liq.length) return [];
  const id = `sb-${date}-${key}-${tf}`;
  const b = builder();
  const cl = (t: number) => Math.min(t, c.maxT);
  const liqHi = Math.max(...liq.map((x) => x.high));
  const liqLo = Math.min(...liq.map((x) => x.low));
  const s1 = b.step("Window opens", ws);
  const focusFrom = ws - 30 * 60;

  b.anns.push(ann(`${id}:window`, "window", "window", "neutral", tf, s1, ws, { label: w.label, flow: "down", t0: fmtTs(ws), t1: fmtTs(cl(we)) }));
  const lt0 = at(liq, 0).time;
  b.anns.push(ann(`${id}:liq_high`, "level", "liquidity", "info", "H1", 0, ws, { label: "Prior high", price: liqHi, t0: fmtTs(lt0), t1: fmtTs(cl(we)) }));
  b.anns.push(ann(`${id}:liq_low`, "level", "liquidity", "info", "H1", 0, ws, { label: "Prior low", price: liqLo, t0: fmtTs(lt0), t1: fmtTs(cl(we)) }));
  const h4 = lastBefore(ds.H4, ws);
  const bullBias = h4 ? h4.close >= h4.open : true;
  if (h4) {
    b.anns.push(ann(`${id}:h4_bias`, "level", "bias", bullBias ? "bull" : "bear", "H4", 0, h4.time + 14400, {
      label: "H4 draw", price: h4.close, t0: fmtTs(h4.time), t1: fmtTs(cl(we)),
    }));
  }
  const pd = slice(ds.H1, ws - 6 * 3600, ws);
  if (pd.length >= 2) {
    const hi = Math.max(...pd.map((x) => x.high));
    const lo = Math.min(...pd.map((x) => x.low));
    const mid = (hi + lo) / 2;
    const t0 = at(pd, 0).time;
    b.anns.push(ann(`${id}:premium`, "zone", "premium_discount", "bear", "H1", 0, ws, { label: "Premium", emphasis: "faint", t0: fmtTs(t0), t1: fmtTs(cl(we)), p_high: hi, p_low: mid }));
    b.anns.push(ann(`${id}:discount`, "zone", "premium_discount", "bull", "H1", 0, ws, { label: "Discount", emphasis: "faint", t0: fmtTs(t0), t1: fmtTs(cl(we)), p_high: mid, p_low: lo }));
  }
  b.cond("window", "Inside the kill-zone window", true, `${w1 - w0} bars in ${w.label}`);

  let sweepIdx = -1;
  let dir: Dir = bullBias ? "long" : "short";
  for (let i = w0; i < w1; i++) {
    const x = at(bars, i);
    if (x.high > liqHi) { sweepIdx = i; dir = "short"; break; }
    if (x.low < liqLo) { sweepIdx = i; dir = "long"; break; }
  }
  const needSweep = p.require_sweep === true;
  if (sweepIdx < 0 && needSweep) {
    b.cond("sweep", "Liquidity swept", false, "no sweep of the prior high or low");
    return rejected(c, id, date, b, focusFrom, we);
  }
  if (sweepIdx >= 0) {
    const x = at(bars, sweepIdx);
    const s = b.step("Sweep", x.time + tfSec);
    b.anns.push(ann(`${id}:sweep`, "marker", "sweep", dir === "short" ? "bear" : "bull", tf, s, x.time + tfSec, {
      label: "Sweep", why: `Took the prior ${dir === "short" ? "high" : "low"}.`, t0: fmtTs(x.time),
      price: dir === "short" ? x.high : x.low, shape: "circle",
    }));
    b.cond("sweep", "Liquidity swept", true, `prior ${dir === "short" ? "high" : "low"} taken`);
  } else {
    b.cond("sweep", "Liquidity swept", null, "Not required");
  }

  const ref = sweepIdx >= 0 ? sweepIdx : w0;
  const pre = bars.slice(ref - 3, ref);
  const preHi = Math.max(...pre.map((x) => x.high));
  const preLo = Math.min(...pre.map((x) => x.low));
  const level = dir === "short" ? preLo : preHi;
  let mss = -1;
  for (let j = ref + 1; j < Math.min(ref + 16, bars.length - 2) && at(bars, j).time < we; j++) {
    const k = at(bars, j).close;
    if (dir === "short" ? k < preLo : k > preHi) { mss = j; break; }
  }
  b.cond("mss", "Market structure shift", mss >= 0, mss >= 0 ? `close beyond ${level.toFixed(c.dec)}` : "no close through the prior swing");
  if (mss < 0) return rejected(c, id, date, b, focusFrom, we, dir);
  const mb = at(bars, mss);
  const mknown = mb.time + tfSec;
  const s3 = b.step("Market structure shift", mknown);
  b.anns.push(ann(`${id}:mss`, "marker", "structure", dir === "short" ? "bear" : "bull", tf, s3, mknown, {
    label: "MSS", t0: fmtTs(mb.time), price: mb.close, shape: dir === "short" ? "arrow_down" : "arrow_up",
  }));
  b.anns.push(ann(`${id}:mss_line`, "line", "structure", "neutral", tf, s3, mknown, {
    label: "MSS", points: [{ t: fmtTs(at(bars, ref - 3).time), p: level }, { t: fmtTs(mb.time), p: level }],
  }));

  const minGap = Number(p.min_gap_pips);
  let fvg = -1;
  for (let k = Math.max(mss - 1, ref + 1); k <= mss + 8 && k + 1 < bars.length; k++) {
    const gap = dir === "short" ? at(bars, k - 1).low - at(bars, k + 1).high : at(bars, k + 1).low - at(bars, k - 1).high;
    if (gap / pip >= minGap) { fvg = k; break; }
  }
  b.cond("fvg", "Fair value gap after the shift", fvg >= 0, fvg >= 0 ? `gap of at least ${minGap} pips` : `no gap of ${minGap} pips or more`);
  if (fvg < 0) return rejected(c, id, date, b, focusFrom, we, dir);
  const a = at(bars, fvg - 1);
  const z = at(bars, fvg + 1);
  const fknown = z.time + tfSec;
  const s4 = b.step("Fair value gap", fknown);
  b.anns.push(ann(`${id}:fvg`, "zone", "imbalance", dir === "short" ? "bear" : "bull", tf, s4, fknown, {
    label: "FVG", t0: fmtTs(a.time), t1: fmtTs(fknown),
    p_high: dir === "short" ? a.low : z.low, p_low: dir === "short" ? z.high : a.high,
  }));

  const entryIdx = Math.max(mss, fvg + 1);
  const eb = at(bars, entryIdx);
  const entry = eb.close;
  const eknown = eb.time + tfSec;
  const span = bars.slice(ref, entryIdx + 1);
  let stop = dir === "short" ? Math.max(...span.map((x) => x.high)) : Math.min(...span.map((x) => x.low));
  if (Math.abs(stop - entry) / pip < 3) stop = dir === "short" ? entry + 3 * pip : entry - 3 * pip;
  const risk = Math.abs(stop - entry);
  const target = dir === "short" ? entry - Number(p.reward_mult) * risk : entry + Number(p.reward_mult) * risk;
  const s5 = b.step("Entry", eknown);
  const sim = simulate(c, entryIdx + 1, dir, entry, stop, target, ws + 3 * 3600, eknown);
  const fin = finishTrade(c, id, { step: s5, dir, entry, stop, target, t0: eknown }, sim, b.anns);
  return [{ wire: setupWire(id, date, b, [focusFrom, cl(fin.exitTime + 20 * 60)], dir, fin.outcome), valid: true, r: fin.r, result: fin.result }];
}

// ---------- entry points ----------
function hashId(s: string): string {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (h >>> 0).toString(16).padStart(8, "0") + "0000";
}

export function buildMockScanWire(req: ScanRequest, ds: Dataset): Wire {
  const def = MOCK_STRATEGIES.find((s) => s.id === req.strategy_id);
  if (!def) throw new ApiError("http", `Unknown strategy "${req.strategy_id}"`, 404);
  if (!def.supported_timeframes.includes(req.timeframe)) {
    throw new ApiError("http", `${def.name} does not support ${req.timeframe}`, 422);
  }
  const p = resolveParams(def, req.params);
  const from = rangeBound(req.from, false);
  const to = rangeBound(req.to, true);
  if (to < from) throw new ApiError("http", "`to` is before `from`", 422);
  const m1 = ds.M1;
  const c: Ctx = {
    pair: req.pair, tf: req.timeframe, tfSec: TF_SECONDS[req.timeframe], pip: pipSize(req.pair), dec: PAIR_META[req.pair].decimals,
    bars: ds[req.timeframe], ds, p, maxT: at(m1, m1.length - 1).time + 60,
  };
  const made: Made[] = [];
  for (let day = floorTo(from, 86400); day <= to; day += 86400) {
    const date = utcDateString(day);
    made.push(...(def.id === "orb" ? orbDay(c, date, day) : sbDay(c, date)));
  }
  const valid = made.filter((m) => m.valid);
  const wins = valid.filter((m) => m.result === "win");
  const losses = valid.filter((m) => m.result === "loss");
  const mean = (xs: Made[]) => (xs.length ? r2(xs.reduce((s, m) => s + m.r, 0) / xs.length) : null);
  const warnings = ["Exploratory scan: in-sample, not validated by the Judge.", "Mock data: generated for UI development, not real prices."];
  if (valid.length < 30) warnings.splice(1, 0, `Only ${valid.length} setups: too few to read anything into.`);
  return {
    scan_id: hashId(JSON.stringify([req, ds.M1.length])),
    timeframe: req.timeframe,
    strategy: def,
    params_used: p,
    setups: made.map((m) => m.wire),
    summary: {
      n_valid: valid.length,
      n_rejected: made.length - valid.length,
      n_wins: wins.length,
      n_losses: losses.length,
      win_rate: valid.length ? r2(wins.length / valid.length) : null,
      expectancy_r: mean(valid),
      avg_win_r: mean(wins),
      avg_loss_r: mean(losses),
      cost_pips_assumed: MOCK_COST_PIPS,
    },
    warnings,
  };
}

export function runMockScan(req: ScanRequest, ds: Dataset): ScanResult {
  return parseScanResult(buildMockScanWire(req, ds));
}