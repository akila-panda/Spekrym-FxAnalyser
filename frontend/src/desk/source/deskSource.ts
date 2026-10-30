/** DESK DK0 — DeskSource interface + the Sourced payload schemas (events, sessions, positioning,
 *  capabilities). Lives beside, not inside, api/dataSource.ts. Detectors do NOT go through DeskSource;
 *  they run on candles. A future backend may add getEngineObjects without UI change. */
import { z } from "zod";
import type { Candle, Pair, Timeframe } from "@/types/market";
import { PairSchema, type AnalysisObject, type Sourced } from "@/desk/types/schemas";

/** Candle query (kept local so Desk does not couple to api/dataSource internals). */
export interface CandleQuery {
  pair: Pair;
  tf: Timeframe;
  /** UTC seconds; window ends here (default: latest). */
  to?: number;
  limit?: number;
}

export const AvailabilitySchema = z.enum(["unverified", "available", "absent"]);
export type Availability = z.infer<typeof AvailabilitySchema>;

export const DeskCapabilitiesSchema = z.object({
  calendar: AvailabilitySchema,
  cot: AvailabilitySchema,
  retailBook: AvailabilitySchema,
  depth: AvailabilitySchema,
});
export type DeskCapabilities = z.infer<typeof DeskCapabilitiesSchema>;

export const DeskEventSchema = z.object({
  id: z.string().min(1),
  time: z.number().int(),
  title: z.string(),
  impact: z.enum(["low", "med", "high"]),
  currency: z.string(),
  actual: z.number().optional(),
  forecast: z.number().optional(),
  previous: z.number().optional(),
});
export type DeskEvent = z.infer<typeof DeskEventSchema>;

export const SessionInfoSchema = z.object({
  pair: PairSchema,
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  approximate: z.boolean().default(true),
  sessions: z.array(z.object({ name: z.string(), open: z.number().int(), close: z.number().int() })),
});
export type SessionInfo = z.infer<typeof SessionInfoSchema>;

export const PositioningSchema = z.object({
  pair: PairSchema,
  cot: z.object({ net: z.number(), percentile: z.number().optional(), index: z.number().optional() }).nullable(),
  retailBook: z.object({ longPct: z.number(), shortPct: z.number() }).nullable(),
}).nullable();
export type Positioning = z.infer<typeof PositioningSchema>;

/** Dev scenarios the mock can simulate (also surfaced via ?deskScenario= in the UI, parsed in DK1). */
export type DeskScenario = "stale" | "missing" | "conflict" | null;

export interface DeskSource {
  readonly kind: "mock" | "api";
  capabilities(signal?: AbortSignal): Promise<Sourced<DeskCapabilities>>;
  getCandles(q: CandleQuery, signal?: AbortSignal): Promise<Candle[]>;
  getEvents(range: { from: number; to: number }, signal?: AbortSignal): Promise<Sourced<DeskEvent[]>>;
  getSessions(pair: Pair, day: string, signal?: AbortSignal): Promise<Sourced<SessionInfo>>;
  getPositioning(pair: Pair, signal?: AbortSignal): Promise<Sourced<Positioning>>;
  /** F0: reserved backend-engine seam. A future `api` source returns detected objects here;
   *  the mock returns sample objects. Detectors still run client-side until this is wired. */
  getEngineObjects(q: CandleQuery, signal?: AbortSignal): Promise<Sourced<AnalysisObject[]>>;
}
