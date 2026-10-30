/** Runtime contract with the backend (api/schemas.py). TS types are inferred
 *  from these schemas. Backend field names are kept (snake_case) except Candle.
 *  All timestamps are converted to UTC seconds here and nowhere else. */
import { z } from "zod";
import { parseBackendTs } from "@/lib/time";
import { PAIRS, TIMEFRAMES, type Candle } from "./market";

// ---------- errors ----------
export class ContractError extends Error {
  readonly issues: string[];
  constructor(readonly label: string, issues: string[]) {
    super(`${label}: ${issues.join("; ")}`);
    this.name = "ContractError";
    this.issues = issues;
  }
}

function fmtPath(path: (string | number)[]): string {
  return path.reduce<string>(
    (acc, p) => (typeof p === "number" ? `${acc}[${p}]` : acc ? `${acc}.${p}` : p),
    "",
  );
}

/** Parse or throw a ContractError whose message names the failing path. */
export function parseWith<S extends z.ZodTypeAny>(schema: S, data: unknown, label: string): z.output<S> {
  const r = schema.safeParse(data);
  if (r.success) return r.data;
  throw new ContractError(
    label,
    r.error.issues.slice(0, 5).map((i) => `${fmtPath(i.path) || "(root)"}: ${i.message}`),
  );
}

// ---------- primitives ----------
export const PairSchema = z.enum(PAIRS);
export const TimeframeSchema = z.enum(TIMEFRAMES);

export const TsSchema = z.string().transform((s, ctx) => {
  try {
    return parseBackendTs(s);
  } catch (e) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: e instanceof Error ? e.message : "invalid timestamp" });
    return z.NEVER;
  }
});

/** Backend sends null for unset fields; the model uses an optional key. */
const nz = <T extends z.ZodTypeAny>(s: T) =>
  s
    .nullish()
    .transform((v): z.output<T> | undefined => v ?? undefined)
    .optional();

// ---------- market data ----------
export const CandleSchema = z
  .object({ t: TsSchema, o: z.number(), h: z.number(), l: z.number(), c: z.number(), v: z.number() })
  .transform((x): Candle => ({ time: x.t, open: x.o, high: x.h, low: x.l, close: x.c, volume: x.v }));

export const CandlesResponseSchema = z.object({
  pair: PairSchema,
  tf: TimeframeSchema,
  candles: z.array(CandleSchema),
});

const BoundSchema = z.object({ first: TsSchema.nullable(), last: TsSchema.nullable() });
export const BoundsResponseSchema = z.object({
  pair: PairSchema,
  bounds: z.object({
    M1: BoundSchema, M5: BoundSchema, M15: BoundSchema, H1: BoundSchema, H4: BoundSchema,
    D: BoundSchema.optional(), W: BoundSchema.optional(),
  }),
});

// ---------- strategy catalog ----------
const paramBase = { key: z.string().min(1), label: z.string(), unit: nz(z.string()), help: nz(z.string()) };
const numericParam = <K extends "number" | "integer">(type: K) =>
  z.object({
    ...paramBase,
    type: z.literal(type),
    default: z.number(),
    min: nz(z.number()),
    max: nz(z.number()),
    step: nz(z.number()),
  });

export const ParamDefSchema = z.discriminatedUnion("type", [
  numericParam("number"),
  numericParam("integer"),
  z.object({ ...paramBase, type: z.literal("boolean"), default: z.boolean() }),
  z.object({ ...paramBase, type: z.literal("select"), default: z.string(), options: z.array(z.string()).min(1) }),
  z.object({
    ...paramBase,
    type: z.literal("time"),
    default: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "expected HH:MM"),
  }),
]);

export const StrategyDefSchema = z
  .object({
    id: z.string().min(1),
    name: z.string(),
    description: z.string(),
    supported_timeframes: z.array(TimeframeSchema),
    context_timeframes: z.array(TimeframeSchema),
    display_tz: z.string().min(1),
    params: z.array(ParamDefSchema),
    /** Drives the three-way strategy filter. Missing is treated as price_only (backwards compatible). */
    signal_class: z.enum(["price_only", "hybrid", "indicator"]).optional(),
    /** Indicators a hybrid/indicator strategy uses, e.g. ["ATR(14)"] — shown as chips. */
    indicators_used: z.array(z.string()).optional(),
    /** Extra data a strategy needs beyond candles, e.g. ["volume", "calendar"]. */
    requires_data: z.array(z.string()).optional(),
  })
  .superRefine((s, ctx) => {
    const seen = new Set<string>();
    s.params.forEach((p, i) => {
      if (seen.has(p.key)) {
        ctx.addIssue({ code: "custom", path: ["params", i, "key"], message: `duplicate param key "${p.key}"` });
      }
      seen.add(p.key);
      if (p.type === "select" && !p.options.includes(p.default)) {
        ctx.addIssue({ code: "custom", path: ["params", i, "default"], message: "default is not in options" });
      }
      if (p.type === "integer" && !Number.isInteger(p.default)) {
        ctx.addIssue({ code: "custom", path: ["params", i, "default"], message: "default is not an integer" });
      }
    });
  });

export const StrategiesResponseSchema = z.array(StrategyDefSchema);

// ---------- annotations ----------
export const TONES = ["bull", "bear", "neutral", "info"] as const;
export const KNOWN_ROLES = [
  "bias", "range", "window", "liquidity", "sweep", "structure", "imbalance", "order_block",
  "premium_discount", "entry", "stop", "target", "filter", "context",
] as const;

const PointSchema = z.object({ t: TsSchema, p: z.number() });
/** A labelled vertex for pattern polylines (ratio text, e.g. harmonic legs). */
const PatternPointSchema = z.object({ t: TsSchema, p: z.number(), label: nz(z.string()) });
/** Indicator series/band sample; `v` is null during warm-up (never 0). */
const ValuePointSchema = z.object({ t: TsSchema, v: z.number().nullable() });
const ParamsUsedSchema = z.record(z.union([z.number(), z.boolean(), z.string()]));

/** Ray/level extras (context-flow objects that evolve over time). */
const rayExtras = {
  dash: nz(z.enum(["solid", "dashed", "dotted"])),
  extend: nz(z.enum(["none", "right", "both"])),
  state: nz(z.enum(["untested", "touched", "mitigated"])),
  mitigated_at: nz(TsSchema),
};

const common = {
  id: z.string().min(1),
  /** Any string is accepted; unknown roles fall back to `tone` when drawn. */
  role: z.string().min(1),
  tone: z.enum(TONES).catch("neutral"),
  source_tf: TimeframeSchema,
  /** 0 = context (always shown), otherwise a step number of the setup. */
  step: z.number().int().min(0).default(0),
  known_at: TsSchema,
  /** Where it is drawn, when that differs from when it was known (e.g. Ichimoku cloud shift). Defaults to known_at. */
  plot_time: nz(TsSchema),
  label: nz(z.string()),
  why: nz(z.string()),
  emphasis: z.enum(["faint", "normal", "strong"]).default("normal"),
  flow: nz(z.enum(["down", "local", "all"])),
  visible_on: nz(z.array(TimeframeSchema)),
};

export const AnnotationSchema = z.discriminatedUnion("kind", [
  z.object({ ...common, ...rayExtras, kind: z.literal("level"), t0: TsSchema, t1: nz(TsSchema), price: z.number() }),
  z.object({
    ...common, kind: z.literal("zone"), t0: TsSchema, t1: TsSchema, p_high: z.number(), p_low: z.number(),
  }),
  z.object({ ...common, kind: z.literal("window"), t0: TsSchema, t1: TsSchema }),
  z.object({ ...common, ...rayExtras, kind: z.literal("line"), points: z.array(PointSchema).min(2) }),
  z.object({
    ...common,
    kind: z.literal("polyline"),
    points: z.array(PatternPointSchema).min(2),
    /** Fibonacci/harmonic leg ratios, e.g. [0.618, 1.272]. */
    ratios: nz(z.array(z.number())),
    pattern_name: nz(z.string()),
    /** False while the pattern is still forming; it must not be drawn as finished. */
    complete: z.boolean().default(true),
  }),
  // Premium/discount dealing range: stacked price bands with an optional equilibrium line.
  z.object({
    ...common, kind: z.literal("banded_zone"), t0: TsSchema, t1: TsSchema,
    bands: z.array(z.object({ p_high: z.number(), p_low: z.number(), role: z.string().min(1) })).min(1),
    mid_price: nz(z.number()),
  }),
  // Fibonacci retracement/extension zone between two anchors.
  z.object({
    ...common, kind: z.literal("fib_zone"),
    anchor_a: PointSchema, anchor_b: PointSchema,
    levels: z.array(z.number()).min(1),
    highlight_range: nz(z.tuple([z.number(), z.number()])),
  }),
  // Highlight specific bars (pin bar, engulfing, displacement).
  z.object({ ...common, kind: z.literal("bar_highlight"), bars: z.array(TsSchema).min(1) }),
  // Indicator line/histogram/area on the price pane or a sub-pane.
  z.object({
    ...common, kind: z.literal("series"),
    pane: z.string().min(1).default("price"),
    style: z.enum(["line", "histogram", "area", "dots", "step"]).default("line"),
    points: z.array(ValuePointSchema),
    params_used: nz(ParamsUsedSchema),
  }),
  // Indicator band (Bollinger/Keltner/Donchian): upper/mid/lower on a pane.
  z.object({
    ...common, kind: z.literal("band"),
    pane: z.string().min(1).default("price"),
    upper: z.array(ValuePointSchema),
    mid: z.array(ValuePointSchema),
    lower: z.array(ValuePointSchema),
    fill: z.boolean().default(true),
    params_used: nz(ParamsUsedSchema),
  }),
  z.object({
    ...common,
    kind: z.literal("marker"),
    t0: TsSchema,
    price: z.number(),
    shape: z
      .enum(["arrow_up", "arrow_down", "circle"])
      .nullish()
      .transform((v) => v ?? ("circle" as const)),
  }),
  z.object({
    ...common,
    kind: z.literal("trade"),
    t0: TsSchema,
    t1: TsSchema,
    direction: z.enum(["long", "short"]),
    entry: z.number(),
    stop: z.number(),
    target: z.number(),
    exit_time: nz(TsSchema),
    exit_price: nz(z.number()),
  }),
  z.object({ ...common, kind: z.literal("text"), t0: TsSchema, price: z.number(), label: z.string() }),
]);

/** A sub-pane for indicator series (RSI/MACD/ATR). `series`/`band` reference it by id. */
export const PaneSchema = z.object({
  id: z.string().min(1),
  title: nz(z.string()),
  height_share: z.number().positive().default(1),
  scale: z.union([z.literal("auto"), z.tuple([z.number(), z.number()])]).default("auto"),
  guides: z.array(z.number()).default([]),
  order: z.number().int().default(0),
});

// ---------- scan ----------
export const StepSchema = z.object({ n: z.number().int().min(1), label: z.string(), known_at: TsSchema });

export const ConditionSchema = z.object({
  key: z.string(),
  label: z.string(),
  /** null = not applicable */
  passed: z.boolean().nullable(),
  detail: z.string().default(""),
});

export const OutcomeSchema = z.object({
  result: z.enum(["win", "loss", "flat"]),
  r_multiple: z.number(),
  net_pips: z.number(),
  cost_pips: z.number(),
  exit_reason: z.string(),
  bars_held: z.number().int().min(0),
});

export const SetupSchema = z
  .object({
    id: z.string().min(1),
    status: z.enum(["valid", "rejected"]),
    direction: nz(z.enum(["long", "short"])),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD"),
    focus: z.object({ from: TsSchema, to: TsSchema }),
    steps: z.array(StepSchema),
    conditions: z.array(ConditionSchema),
    annotations: z.array(AnnotationSchema),
    outcome: nz(OutcomeSchema),
  })
  .superRefine((s, ctx) => {
    if (s.status === "valid" && !s.outcome) {
      ctx.addIssue({ code: "custom", path: ["outcome"], message: "valid setup requires an outcome" });
    }
    const steps = new Set(s.steps.map((x) => x.n));
    const ids = new Set<string>();
    s.annotations.forEach((a, i) => {
      if (a.step !== 0 && !steps.has(a.step)) {
        ctx.addIssue({ code: "custom", path: ["annotations", i, "step"], message: `step ${a.step} is not in setup.steps` });
      }
      if (ids.has(a.id)) {
        ctx.addIssue({ code: "custom", path: ["annotations", i, "id"], message: `duplicate annotation id "${a.id}"` });
      }
      ids.add(a.id);
    });
    if (s.focus.to <= s.focus.from) {
      ctx.addIssue({ code: "custom", path: ["focus"], message: "focus.to must be after focus.from" });
    }
  });

export const ScanSummarySchema = z.object({
  n_valid: z.number().int().min(0),
  n_rejected: z.number().int().min(0),
  n_wins: z.number().int().min(0),
  n_losses: z.number().int().min(0),
  win_rate: z.number().nullable(),
  expectancy_r: z.number().nullable(),
  avg_win_r: z.number().nullable(),
  avg_loss_r: z.number().nullable(),
  cost_pips_assumed: z.number(),
});

export const ParamValueSchema = z.union([z.number(), z.boolean(), z.string()]);

export const ScanResultSchema = z
  .object({
    scan_id: z.string().min(1),
    timeframe: TimeframeSchema,
    strategy: StrategyDefSchema,
    params_used: z.record(ParamValueSchema),
    setups: z.array(SetupSchema),
    summary: ScanSummarySchema,
    warnings: z.array(z.string()),
    /** Sub-panes this scan's series/band annotations reference. Omitted = price pane only. */
    panes: z.array(PaneSchema).optional(),
  })
  .superRefine((r, ctx) => {
    const ids = new Set<string>();
    r.setups.forEach((s, i) => {
      if (ids.has(s.id)) ctx.addIssue({ code: "custom", path: ["setups", i, "id"], message: `duplicate setup id "${s.id}"` });
      ids.add(s.id);
    });
  });

/** What the client POSTs. `from` / `to` are ISO-8601 UTC strings. */
export const ScanRequestSchema = z.object({
  strategy_id: z.string().min(1),
  pair: PairSchema,
  timeframe: TimeframeSchema,
  from: z.string().min(1),
  to: z.string().min(1),
  params: z.record(ParamValueSchema),
});

// ---------- inferred types ----------
export type ParamValue = z.infer<typeof ParamValueSchema>;
export type ParamDef = z.infer<typeof ParamDefSchema>;
export type StrategyDef = z.infer<typeof StrategyDefSchema>;
export type Annotation = z.infer<typeof AnnotationSchema>;
export type AnnotationKind = Annotation["kind"];
export type Tone = (typeof TONES)[number];
export type Step = z.infer<typeof StepSchema>;
export type Condition = z.infer<typeof ConditionSchema>;
export type Outcome = z.infer<typeof OutcomeSchema>;
export type Setup = z.infer<typeof SetupSchema>;
export type ScanSummary = z.infer<typeof ScanSummarySchema>;
export type Pane = z.infer<typeof PaneSchema>;
export type ScanResult = z.infer<typeof ScanResultSchema>;
export type ScanRequest = z.infer<typeof ScanRequestSchema>;
export type CandlesResponse = z.infer<typeof CandlesResponseSchema>;
export type BoundsResponse = z.infer<typeof BoundsResponseSchema>;

// ---------- entry points ----------
export const parseCandles = (d: unknown): CandlesResponse => parseWith(CandlesResponseSchema, d, "candles");
export const parseBounds = (d: unknown): BoundsResponse => parseWith(BoundsResponseSchema, d, "bounds");
export const parseStrategies = (d: unknown): StrategyDef[] => parseWith(StrategiesResponseSchema, d, "strategies");
export const parseScanResult = (d: unknown): ScanResult => parseWith(ScanResultSchema, d, "scan");