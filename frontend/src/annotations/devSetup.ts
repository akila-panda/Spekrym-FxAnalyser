import { toIsoUtc } from "@/lib/time";
import { AnnotationSchema, StepSchema, type Annotation, type Step } from "@/types/schemas";
import type { Candle } from "@/types/market";

export const DEV_BARS_NEEDED = 16;

/** DEV ONLY: a hand-built setup that exercises routing: an H1 zone, an H4 bias level, an M1 marker,
 *  an M15 window, polyline, marker, text, and a trade box. Needs the last 16 M15 bars. */
export function buildDevSetup(bars: readonly Candle[]): { annotations: Annotation[]; steps: Step[] } {
  if (bars.length < DEV_BARS_NEEDED) throw new Error(`need ${DEV_BARS_NEEDED} bars`);
  const b = bars.slice(-DEV_BARS_NEEDED);
  const ts = (i: number) => toIsoUtc(b[i]!.time);
  const mid = b.reduce((s, x) => s + x.close, 0) / b.length;
  const hi = Math.max(...b.map((x) => x.high));
  const lo = Math.min(...b.map((x) => x.low));
  const span = hi - lo;
  const base = { tone: "neutral", emphasis: "normal" };

  const steps = [
    { n: 1, label: "Range forms", known_at: ts(5) },
    { n: 2, label: "Sweep and break", known_at: ts(9) },
    { n: 3, label: "Entry", known_at: ts(12) },
  ].map((s) => StepSchema.parse(s));

  const wire = [
    { ...base, id: "dev-h1-fvg", kind: "zone", role: "imbalance", tone: "bull", source_tf: "H1", step: 1, known_at: ts(5),
      t0: ts(2), t1: ts(9), p_high: mid + span * 0.08, p_low: mid - span * 0.04, label: "H1 FVG", why: "Dev sample: an H1 gap. Visible on H1 and lower, not on H4." },
    { ...base, id: "dev-h4-bias", kind: "level", role: "bias", tone: "info", source_tf: "H4", step: 0, known_at: ts(0),
      t0: ts(0), price: hi - span * 0.05, label: "H4 bias", why: "Dev sample: H4 draw on liquidity. Flows down to every chart." },
    { ...base, id: "dev-m15-window", kind: "window", role: "window", source_tf: "M15", step: 1, known_at: ts(4),
      t0: ts(4), t1: ts(8), why: "Dev sample: an M15 entry window." },
    { ...base, id: "dev-m15-vwap", kind: "polyline", role: "filter", source_tf: "M15", step: 1, known_at: ts(5),
      points: b.slice(3).map((x) => ({ t: toIsoUtc(x.time), p: (x.high + x.low) / 2 })), why: "Dev sample: a filter line." },
    { ...base, id: "dev-m1-sweep", kind: "marker", role: "sweep", tone: "bear", source_tf: "M1", step: 2, known_at: ts(9),
      t0: ts(9), price: hi, shape: "arrow_down", label: "Sweep", why: "Dev sample: an M1 marker. Appears on M1 only." },
    { ...base, id: "dev-m15-mss", kind: "marker", role: "structure", source_tf: "M15", step: 2, known_at: ts(11),
      t0: ts(11), price: mid, shape: "circle", label: "MSS", why: "Dev sample: an M15 marker. Appears on M15 only." },
    { ...base, id: "dev-m15-bos", kind: "text", role: "structure", source_tf: "M15", step: 2, known_at: ts(11),
      t0: ts(11), price: mid + span * 0.1, label: "BOS", why: "Dev sample: an M15 label." },
    { ...base, id: "dev-trade", kind: "trade", role: "entry", tone: "bull", source_tf: "M15", step: 3, known_at: ts(12),
      t0: ts(12), t1: ts(15), direction: "long", entry: mid, stop: mid - span * 0.12, target: mid + span * 0.24,
      exit_price: mid + span * 0.24, label: "+2.0R", why: "Dev sample: a trade box. Appears on all five charts." },
    // Phase 15 primitives:
    { ...base, id: "dev-h1-dealing-range", kind: "banded_zone", role: "premium_discount", tone: "bear", source_tf: "H1", step: 1, known_at: ts(5),
      t0: ts(2), t1: ts(9), mid_price: lo + span * 0.5, label: "Dealing range",
      bands: [{ p_high: hi, p_low: lo + span * 0.5, role: "premium_discount" }, { p_high: lo + span * 0.5, p_low: lo, role: "premium_discount" }],
      why: "Dev sample: premium/discount dealing range with an equilibrium line." },
    { ...base, id: "dev-m15-choch", kind: "line", role: "structure", source_tf: "M15", step: 2, known_at: ts(10), dash: "dashed",
      points: [{ t: ts(6), p: hi - span * 0.1 }, { t: ts(12), p: hi - span * 0.1 }], label: "CHoCH",
      why: "Dev sample: a dashed structure break line." },
    { ...base, id: "dev-m15-ob-mitigated", kind: "level", role: "order_block", source_tf: "M15", step: 2, known_at: ts(9),
      t0: ts(7), price: lo + span * 0.3, state: "mitigated", extend: "right", label: "OB (mitigated)",
      why: "Dev sample: a mitigated level drawn faint and extended right." },
    { ...base, id: "dev-m15-displacement", kind: "bar_highlight", role: "structure", tone: "bull", source_tf: "M15", step: 2, known_at: ts(10),
      bars: [ts(9), ts(10)], label: "Displacement", why: "Dev sample: highlighted displacement bars." },
    // Phase 16 primitives:
    { ...base, id: "dev-m15-ote", kind: "fib_zone", role: "entry", tone: "bull", source_tf: "M15", step: 3, known_at: ts(12),
      anchor_a: { t: ts(9), p: lo }, anchor_b: { t: ts(12), p: hi }, levels: [0.618, 0.705, 0.79], highlight_range: [0.618, 0.79],
      label: "OTE", why: "Dev sample: a Fibonacci OTE zone (price-only)." },
    { ...base, id: "dev-h1-gartley", kind: "polyline", role: "structure", source_tf: "H1", step: 2, known_at: ts(11), complete: false,
      pattern_name: "Gartley", ratios: [0.618, 0.382, 1.272],
      points: [
        { t: ts(1), p: lo + span * 0.2, label: "X" }, { t: ts(4), p: hi - span * 0.1, label: "A" },
        { t: ts(7), p: lo + span * 0.35, label: "B" }, { t: ts(10), p: hi - span * 0.2, label: "C" },
      ],
      why: "Dev sample: a forming harmonic pattern (drawn faint until complete)." },
    // Phase 18 indicators:
    { ...base, id: "dev-ema20", kind: "series", role: "filter", source_tf: "M15", step: 0, known_at: ts(0),
      pane: "price", style: "line", label: "EMA(20)",
      points: b.map((x, i) => ({ t: toIsoUtc(x.time), v: i < 3 ? null : x.close })),
      why: "Dev sample: a moving average overlay on the price pane (warm-up is null)." },
    { ...base, id: "dev-bb", kind: "band", role: "range", source_tf: "M15", step: 0, known_at: ts(0),
      pane: "price", label: "BB(20,2)",
      upper: b.map((x) => ({ t: toIsoUtc(x.time), v: x.close + span * 0.12 })),
      mid: b.map((x) => ({ t: toIsoUtc(x.time), v: x.close })),
      lower: b.map((x) => ({ t: toIsoUtc(x.time), v: x.close - span * 0.12 })),
      why: "Dev sample: a Bollinger band on the price pane." },
    { ...base, id: "dev-rsi", kind: "series", role: "filter", source_tf: "M15", step: 0, known_at: ts(0),
      pane: "rsi", style: "line", label: "RSI(14)",
      points: b.map((x, i) => ({ t: toIsoUtc(x.time), v: i < 3 ? null : 50 + ((x.close - mid) / (span || 1)) * 40 })),
      why: "Dev sample: an RSI line on its own sub-pane." },
  ];
  return { annotations: wire.map((w) => AnnotationSchema.parse(w)), steps };
}