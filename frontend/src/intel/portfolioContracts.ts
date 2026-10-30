/** F17 — Portfolio Command records (additive). Reuses PortfolioExposure / EligibilityDecision / TradeRecord from
 *  CONTRACTS §7; SafetyVeto/SafetyLimits per §8. The console is observe-only (D6): nothing here allocates or trades. */
import { z } from "zod";
import { PairSchema } from "@/desk/types/schemas";
import { EligibilityDecisionSchema, PortfolioExposureSchema, TradeRecordSchema } from "./contracts";

export const LIFECYCLE_STAGES = ["proposed", "research", "validated", "shadow", "paused", "retired"] as const;
export const LifecycleStageSchema = z.enum(LIFECYCLE_STAGES);
export type LifecycleStage = z.infer<typeof LifecycleStageSchema>;

export const LifecycleEventSchema = z.object({
  strategy_id: z.string().min(1),
  strategy_version: z.string().min(1),
  stage: LifecycleStageSchema,
  since: z.number().int(),
  note: z.string().default(""),
});
export type LifecycleEvent = z.infer<typeof LifecycleEventSchema>;

export const AllocationSchema = z.object({
  strategy_id: z.string().min(1),
  weight: z.number().min(0).max(1),
  riskBudgetPct: z.number().nonnegative(),
  effectiveFrom: z.number().int(),
});
export type Allocation = z.infer<typeof AllocationSchema>;

export const PositionSchema = z.object({
  position_id: z.string().min(1),
  strategy_id: z.string().min(1),
  instrument: PairSchema,
  direction: z.enum(["long", "short"]),
  riskPct: z.number().nonnegative(),
  opened_at: z.number().int(),
  closed_at: z.number().int().optional(),
  trade_id: z.string().min(1),
});
export type Position = z.infer<typeof PositionSchema>;

export const SafetyVetoSchema = z.object({
  at: z.number().int(),
  scope: z.enum(["trade", "strategy", "portfolio", "global"]),
  limit: z.string().min(1),
  observed: z.number(),
  reason: z.string(),
  actor: z.literal("safety"),
  strategy_id: z.string().optional(),
  clearedAt: z.number().int().optional(),
});
export type SafetyVeto = z.infer<typeof SafetyVetoSchema>;

export const PortfolioLimitsSchema = z.object({
  killSwitch: z.boolean(),
  exposureCap: z.number().positive(),
  maxDrawdownPct: z.number().positive(),
});
export type PortfolioLimits = z.infer<typeof PortfolioLimitsSchema>;

export const PortfolioCommandSnapshotSchema = z.object({
  exposures: z.array(PortfolioExposureSchema),
  eligibility: z.array(EligibilityDecisionSchema),
  allocations: z.array(AllocationSchema),
  positions: z.array(PositionSchema),
  lifecycle: z.array(LifecycleEventSchema),
  vetoLog: z.array(SafetyVetoSchema),
  limits: PortfolioLimitsSchema,
  trades: z.array(TradeRecordSchema),
});
export type PortfolioCommandSnapshot = z.infer<typeof PortfolioCommandSnapshotSchema>;
export const parsePortfolioCommand = (u: unknown): PortfolioCommandSnapshot => PortfolioCommandSnapshotSchema.parse(u);