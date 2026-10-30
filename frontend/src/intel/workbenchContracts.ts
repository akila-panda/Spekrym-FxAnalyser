/** F15 — Research Workbench records (additive; CONTRACTS §6 StrategyVersion/HypothesisDraft + Job). Read-only. */
import { z } from "zod";
import { EvidenceTierSchema, JobSchema, VerdictSchema } from "./contracts";

export const StrategySpecificationSchema = z.object({
  id: z.string().min(1),
  version: z.string().min(1),
  universe: z.object({ instruments: z.array(z.string()).min(1), timeframe: z.string().min(1) }),
  entry: z.object({ direction: z.enum(["long", "short", "both"]), conditions: z.array(z.string()).default([]) }),
  exit: z.object({ stop: z.string(), target: z.string() }),
  risk: z.object({ risk_per_trade: z.number() }),
  execution: z.object({ model: z.string() }),
});
export type StrategySpecification = z.infer<typeof StrategySpecificationSchema>;

export const StrategyVersionSchema = z.object({
  strategyId: z.string().min(1),
  version: z.string().min(1),
  spec: StrategySpecificationSchema,
  highestTier: EvidenceTierSchema,
  createdAt: z.number().int(),
});
export type StrategyVersion = z.infer<typeof StrategyVersionSchema>;

export const HypothesisDraftSchema = z.object({
  id: z.string().min(1),
  hypothesis: z.string().min(1),
  strategySpec: StrategySpecificationSchema,
  testPlan: z.string().min(1),
  proposedBy: z.enum(["human", "master_brain"]),
  asOf: z.number().int(),
});
export type HypothesisDraft = z.infer<typeof HypothesisDraftSchema>;

/** A Job plus its DAG edges and links back to the hypothesis/strategy it serves. */
export const WorkbenchJobSchema = z.object({
  job: JobSchema,
  label: z.string().min(1),
  dependsOn: z.array(z.string()).default([]),
  hypothesisId: z.string().optional(),
  strategyVersion: z.string().optional(),
});
export type WorkbenchJob = z.infer<typeof WorkbenchJobSchema>;

export const WorkbenchReportSchema = z.object({
  id: z.string().min(1),
  hypothesisId: z.string().optional(),
  strategyVersion: z.string().min(1),
  experimentId: z.string().min(1),
  createdAt: z.number().int(),
  experiment_count: z.number().int().nonnegative(),
  fdr_alpha: z.number(),
  verdicts: z.array(VerdictSchema),
});
export type WorkbenchReport = z.infer<typeof WorkbenchReportSchema>;

export const WorkbenchSnapshotSchema = z.object({
  hypotheses: z.array(HypothesisDraftSchema),
  strategies: z.array(StrategyVersionSchema),
  jobs: z.array(WorkbenchJobSchema),
  reports: z.array(WorkbenchReportSchema),
});
export type WorkbenchSnapshot = z.infer<typeof WorkbenchSnapshotSchema>;
export const parseWorkbench = (u: unknown): WorkbenchSnapshot => WorkbenchSnapshotSchema.parse(u);