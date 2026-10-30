/** DESK DK0 — object model, lifecycle, grade, relations, decisions, snapshots, methodology, Sourced<T>.
 *  Zod schemas + inferred types. Pure; no React, no stores. Times are UTC seconds. */
import { z } from "zod";
import { PAIRS, TIMEFRAMES } from "@/types/market";

export const PairSchema = z.enum([...PAIRS] as [string, ...string[]]);
export const TfSchema = z.enum([...TIMEFRAMES] as [string, ...string[]]);

export const OBJECT_TYPES = [
  "swing", "structure_event", "sr_level", "reference_level", "fvg",
  "liquidity_pool", "sweep", "sd_zone", "trendline", "range",
  "impulse", "candle_signal", "relation",
] as const;
export const ObjectTypeSchema = z.enum(OBJECT_TYPES);
export type ObjectType = z.infer<typeof ObjectTypeSchema>;

export const LAYERS = ["structure", "levels", "supplyDemand", "liquidity", "fvg", "priceAction"] as const;
export const LayerSchema = z.enum(LAYERS);
export type LayerId = z.infer<typeof LayerSchema>;

export const DirectionSchema = z.enum(["bull", "bear"]);
export const DataKindSchema = z.enum(["sample", "live"]);

/** Price band(s) + time anchors. Zones are bands, never single lines (except reference levels, band of zero height). */
export const GeometrySchema = z.object({
  bands: z.array(z.object({ pHigh: z.number(), pLow: z.number() })).default([]),
  points: z.array(z.object({ t: z.number(), p: z.number() })).optional(),
  anchorTimes: z.array(z.number().int()).min(1),
});
export type Geometry = z.infer<typeof GeometrySchema>;

export const LifecycleEventSchema = z.object({
  kind: z.string().min(1),
  t: z.number().int(),
  known_at: z.number().int(),
  detail: z.record(z.union([z.number(), z.string()])).optional(),
});
export type LifecycleEvent = z.infer<typeof LifecycleEventSchema>;

export const FactorSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  status: z.enum(["supports", "opposes", "unavailable"]),
  value: z.number().optional(),
  note: z.string().optional(),
});
export const GradeSchema = z.object({
  significance: z.number().nullable(),
  relevance: z.number().nullable(),
  quality: z.number().nullable(),
  freshness: z.number().nullable(),
  factors: z.array(FactorSchema).default([]),
});
export type Grade = z.infer<typeof GradeSchema>;

export const EvidenceRefSchema = z.object({
  t: z.number().int().optional(),
  objectId: z.string().optional(),
  note: z.string().optional(),
});

export const ProvenanceSchema = z.object({
  rulesVersion: z.string().min(1),
  dataKind: DataKindSchema,
  detector: z.string().min(1),
  detectorVersion: z.number().int().min(0),
});

export const AnalysisObjectSchema = z.object({
  id: z.string().min(1),
  type: ObjectTypeSchema,
  layer: LayerSchema,
  pair: PairSchema,
  source_tf: TfSchema,
  direction: DirectionSchema.optional(),
  geometry: GeometrySchema,
  t_event: z.number().int(),
  known_at: z.number().int(),
  confirmed_at: z.number().int().nullable().default(null),
  lifecycle: z.array(LifecycleEventSchema).default([]),
  origin_id: z.string().optional(),
  grade: GradeSchema.optional(),
  provenance: ProvenanceSchema,
  evidence: z.array(EvidenceRefSchema).default([]),
});
export type AnalysisObject = z.infer<typeof AnalysisObjectSchema>;

export const RELATION_KINDS = ["overlap", "nested", "contains", "shared_origin"] as const;
export const RelationSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(RELATION_KINDS),
  aId: z.string().min(1),
  bId: z.string().min(1),
  band: z.object({ pHigh: z.number(), pLow: z.number() }).optional(),
  known_at: z.number().int(),
});
export type Relation = z.infer<typeof RelationSchema>;

export const DecisionSchema = z.object({
  id: z.string().min(1),
  pair: PairSchema,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  objectId: z.string().min(1),
  action: z.enum(["accept", "reject", "revisit", "custom"]),
  note: z.string().optional(),
  decided_at: z.number().int(),
  rulesVersion: z.string().min(1),
});
export type Decision = z.infer<typeof DecisionSchema>;

export const SnapshotSchema = z.object({
  id: z.string().min(1),
  pair: PairSchema,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  as_of: z.number().int(),
  dataKind: DataKindSchema,
  rulesVersion: z.string().min(1),
  acceptedIds: z.array(z.string()).default([]),
  rejectedIds: z.array(z.string()).default([]),
  revisitIds: z.array(z.string()).default([]),
  reviewedSteps: z.array(z.string()).default([]),
  objects: z.array(AnalysisObjectSchema).default([]),
  notes: z.string().optional(),
  created_at: z.number().int(),
});
export type Snapshot = z.infer<typeof SnapshotSchema>;

/** Analytical rules (versioned). Separate from Preferences (presentation). Full defaults in methodology/defaults.ts. */
export const MethodologySchema = z.object({
  version: z.number().int().min(1),
  rulesVersion: z.string().min(1),
  params: z.record(z.union([z.number(), z.string(), z.boolean(), z.array(z.number()), z.record(z.number())])),
});
export type Methodology = z.infer<typeof MethodologySchema>;

export const ComplexitySchema = z.enum(["minimal", "standard", "advanced"]);
export type Complexity = z.infer<typeof ComplexitySchema>;
export const PreferencesSchema = z.object({
  version: z.number().int().min(1),
  complexity: ComplexitySchema.default("standard"),
  layoutByWorkflow: z.record(z.string()).default({}),
  focusSets: z.record(z.array(z.string())).default({}),
});
export type Preferences = z.infer<typeof PreferencesSchema>;

/** Every datum from a DeskSource is wrapped so the UI can label "sample" from provenance, never per-widget. */
export const SourcedProvenanceSchema = z.object({
  kind: DataKindSchema,
  asOf: z.number().int(),
  fetchedAt: z.number().int(),
  stale: z.boolean().optional(),
});
export type SourcedProvenance = z.infer<typeof SourcedProvenanceSchema>;
export interface Sourced<T> { data: T; provenance: SourcedProvenance }
export const sourced = <S extends z.ZodTypeAny>(schema: S) =>
  z.object({ data: schema, provenance: SourcedProvenanceSchema });
