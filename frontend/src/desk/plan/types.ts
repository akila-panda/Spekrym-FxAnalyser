/** DESK DK16 — Trade plan, journal entry (frozen decision record) and outcome (recorded separately). Zod + inferred. Pure. */
import { z } from "zod";
import { AnalysisObjectSchema, DataKindSchema, PairSchema } from "@/desk/types/schemas";

const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const PlanSchema = z.object({
  id: z.string().min(1),
  pair: PairSchema,
  date: DateStr,
  idea: z.string().max(1000).default(""),
  confirm: z.string().max(1000).default(""),
  invalidation: z.string().max(1000).default(""),
  /** Target in R multiples (1R = the planned risk). */
  targetR: z.number().positive().max(100).nullable().default(null),
  /** Planned risk as % of account. */
  riskPct: z.number().positive().max(100).nullable().default(null),
  linkedObjectIds: z.array(z.string()).default([]),
  updated_at: z.number().int(),
});
export type Plan = z.infer<typeof PlanSchema>;

export const BIASES = ["bullish", "bearish", "neutral"] as const;
export type Bias = (typeof BIASES)[number];

/** A recorded decision: frozen at the moment of recording. Evidence = copies of the linked objects as known at `as_of`. */
export const JournalEntrySchema = z.object({
  id: z.string().min(1),
  pair: PairSchema,
  date: DateStr,
  recorded_at: z.number().int(),
  as_of: z.number().int(),
  rulesVersion: z.string().min(1),
  dataKind: DataKindSchema,
  bias: z.enum(BIASES),
  briefState: z.string(),
  plan: PlanSchema,
  evidence: z.array(AnalysisObjectSchema).default([]),
  tags: z.array(z.string().max(30)).max(10).default([]),
  note: z.string().max(2000).default(""),
});
export type JournalEntry = z.infer<typeof JournalEntrySchema>;

/** The result is judged separately from the decision; it is attached later and never alters the entry. */
export const RESULTS = ["win", "loss", "breakeven", "no_trade"] as const;
export const OutcomeSchema = z.object({
  result: z.enum(RESULTS),
  r: z.number().min(-100).max(100).nullable().default(null),
  followedPlan: z.boolean().nullable().default(null),
  note: z.string().max(1000).default(""),
  set_at: z.number().int(),
});
export type Outcome = z.infer<typeof OutcomeSchema>;