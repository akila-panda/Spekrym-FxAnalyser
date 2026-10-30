/** F16 — Master Brain Console records (additive). `AuthorizationDecision` follows CONTRACTS §8; the rest are
 *  console view records. The Brain only PROPOSES (D6/D11); decisions are made server-side by a human. */
import { z } from "zod";

export const AuthorizationDecisionSchema = z.object({
  actor: z.string().min(1),
  action: z.string().min(1),
  permission: z.string().min(1),
  source: z.string().min(1),
  sourceVersion: z.string().min(1),
  timestamp: z.number().int(),
  rationale: z.string(),
});
export type AuthorizationDecision = z.infer<typeof AuthorizationDecisionSchema>;

export const CAPABILITIES = [
  "propose_hypothesis", "draft_spec", "register_experiment",
  "read_vault", "write_verdict", "change_judge_config", "place_order", "lift_limit",
] as const;
export const CapabilitySchema = z.enum(CAPABILITIES);
export type Capability = z.infer<typeof CapabilitySchema>;

export const BrainPermissionSchema = z.object({
  capability: CapabilitySchema,
  granted: z.boolean(),
  reason: z.string().default(""),
  effectiveFrom: z.number().int(),
});
export type BrainPermission = z.infer<typeof BrainPermissionSchema>;

export const BrainBudgetSchema = z.object({
  id: z.string().min(1),
  resource: z.enum(["llm_tokens", "compute_jobs", "experiments"]),
  limit: z.number().positive(),
  used: z.number().nonnegative(),
  window: z.enum(["day", "week"]),
  observedAt: z.number().int(),
});
export type BrainBudget = z.infer<typeof BrainBudgetSchema>;

export const BrainObjectiveSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  status: z.enum(["active", "paused", "done"]),
  createdAt: z.number().int(),
});
export type BrainObjective = z.infer<typeof BrainObjectiveSchema>;

export const BrainProposalSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["hypothesis", "strategy_spec", "experiment_batch"]),
  title: z.string().min(1),
  rationale: z.string(),
  objectiveId: z.string().optional(),
  hypothesisId: z.string().optional(),
  proposedAt: z.number().int(),
  expiresAt: z.number().int().optional(),
});
export type BrainProposal = z.infer<typeof BrainProposalSchema>;

export const BrainConsoleSnapshotSchema = z.object({
  objectives: z.array(BrainObjectiveSchema),
  proposals: z.array(BrainProposalSchema),
  permissions: z.array(BrainPermissionSchema),
  budgets: z.array(BrainBudgetSchema),
  decisions: z.array(AuthorizationDecisionSchema),
});
export type BrainConsoleSnapshot = z.infer<typeof BrainConsoleSnapshotSchema>;
export const parseBrainConsole = (u: unknown): BrainConsoleSnapshot => BrainConsoleSnapshotSchema.parse(u);