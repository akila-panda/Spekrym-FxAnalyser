/** F18 — Ops & Data Observatory records (additive). Feed quality per DATA_FOUNDATION; broker sync / compute / model
 *  drift per SAFETY_EXECUTION + RESEARCH_OS (W9.4). Observe-only (D6). State is DERIVED from raw timestamps/metrics,
 *  never trusted from a claimed status field. */
import { z } from "zod";
import { PairSchema } from "@/desk/types/schemas";

export const FEED_KINDS = ["candles", "calendar", "news", "broker_prices"] as const;
export const FeedKindSchema = z.enum(FEED_KINDS);
export type FeedKind = z.infer<typeof FeedKindSchema>;

export const FeedObservationSchema = z.object({
  feed_id: z.string().min(1),
  label: z.string().min(1),
  kind: FeedKindSchema,
  instrument: PairSchema.optional(),
  at: z.number().int(), // when this quality reading was taken (available_at)
  lastDataAt: z.number().int(), // newest datum the feed delivered
  staleAfterSec: z.number().positive(),
  qualityScore: z.number().min(0).max(1),
  minQuality: z.number().min(0).max(1),
  gaps: z.array(z.object({ from: z.number().int(), to: z.number().int() })),
  affectsDecisions: z.boolean(),
});
export type FeedObservation = z.infer<typeof FeedObservationSchema>;

export const BrokerSyncObservationSchema = z.object({
  broker: z.string().min(1),
  at: z.number().int(),
  lastSyncAt: z.number().int(),
  staleAfterSec: z.number().positive(),
  connected: z.boolean(),
  discrepancies: z.number().int().nonnegative(),
  note: z.string().default(""),
});
export type BrokerSyncObservation = z.infer<typeof BrokerSyncObservationSchema>;

export const OpsJobSchema = z.object({
  job_id: z.string().min(1),
  kind: z.string().min(1),
  queuedAt: z.number().int(),
  startedAt: z.number().int().optional(),
  finishedAt: z.number().int().optional(),
  error: z.string().optional(),
  expectedSec: z.number().positive(),
});
export type OpsJob = z.infer<typeof OpsJobSchema>;

export const ModelDriftObservationSchema = z.object({
  model_id: z.string().min(1),
  version: z.string().min(1),
  at: z.number().int(),
  driftScore: z.number().nonnegative(),
  driftLimit: z.number().positive(),
  calibrationError: z.number().nonnegative(),
  calibrated: z.boolean(),
});
export type ModelDriftObservation = z.infer<typeof ModelDriftObservationSchema>;

export const OpsSnapshotSchema = z.object({
  feeds: z.array(FeedObservationSchema),
  broker: z.array(BrokerSyncObservationSchema),
  jobs: z.array(OpsJobSchema),
  drift: z.array(ModelDriftObservationSchema),
});
export type OpsSnapshot = z.infer<typeof OpsSnapshotSchema>;
export const parseOps = (u: unknown): OpsSnapshot => OpsSnapshotSchema.parse(u);