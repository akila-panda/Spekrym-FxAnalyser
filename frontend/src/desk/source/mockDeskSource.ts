/** DESK DK0 — mock DeskSource. Seeded, deterministic, always "sample". Supports dev scenarios
 *  (stale | missing | conflict). Deep candle history is DK2; here getCandles returns a small stub. */
import { TF_SECONDS, type Candle, type Pair } from "@/types/market";
import type { AnalysisObject, Sourced, SourcedProvenance } from "@/desk/types/schemas";
import { SAMPLE_ENGINE_OBJECTS } from "@/intel/fixtures";
import type {
  CandleQuery, DeskCapabilities, DeskEvent, DeskScenario, DeskSource, Positioning, SessionInfo,
} from "./deskSource";

export interface MockDeskOptions {
  scenario?: DeskScenario;
  /** UTC seconds "now"; default a fixed sample instant so output is deterministic. */
  now?: number;
}

const DEFAULT_NOW = 1_746_828_000; // 2025-05-09T22:00:00Z (end of the sample mock window)

const prov = (now: number, stale: boolean): SourcedProvenance => ({
  kind: "sample", asOf: stale ? now - 3600 : now, fetchedAt: now, ...(stale ? { stale: true } : {}),
});
const wrap = <T>(data: T, now: number, stale: boolean): Sourced<T> => ({ data, provenance: prov(now, stale) });

function dayStartUtc(day: string): number {
  return Math.floor(Date.parse(`${day}T00:00:00Z`) / 1000);
}

export function createMockDeskSource(opts: MockDeskOptions = {}): DeskSource {
  const scenario = opts.scenario ?? null;
  const now = opts.now ?? DEFAULT_NOW;
  const stale = scenario === "stale";
  const missing = scenario === "missing";
  const conflict = scenario === "conflict";

  return {
    kind: "mock",

    async getEngineObjects(): Promise<Sourced<AnalysisObject[]>> {
      return wrap<AnalysisObject[]>(missing ? [] : SAMPLE_ENGINE_OBJECTS, now, stale);
    },

    async capabilities(): Promise<Sourced<DeskCapabilities>> {
      const caps: DeskCapabilities = missing
        ? { calendar: "absent", cot: "absent", retailBook: "absent", depth: "absent" }
        : { calendar: "available", cot: "available", retailBook: "unverified", depth: "absent" };
      return wrap(caps, now, stale);
    },

    async getCandles(q: CandleQuery): Promise<Candle[]> {
      if (missing) return [];
      const step = TF_SECONDS[q.tf];
      const end = q.to ?? now;
      const n = Math.max(1, Math.min(q.limit ?? 10, 200));
      const out: Candle[] = [];
      for (let i = n - 1; i >= 0; i--) {
        const t = end - (i + 1) * step;
        const base = 1.1 + ((t % 1000) / 1000) * 0.01; // deterministic, flat-ish stub
        out.push({ time: t, open: base, high: base + 0.0008, low: base - 0.0008, close: base + 0.0002, volume: 100 });
      }
      return out;
    },

    async getEvents(range): Promise<Sourced<DeskEvent[]>> {
      if (missing) return wrap<DeskEvent[]>([], now, stale);
      const events: DeskEvent[] = [
        { id: "e1", time: Math.floor((range.from + range.to) / 2), title: "US CPI (sample)", impact: "high", currency: "USD", forecast: 3.2, previous: 3.4 },
        { id: "e2", time: range.to - 1800, title: "ECB speak (sample)", impact: "med", currency: "EUR" },
      ];
      return wrap(events, now, stale);
    },

    async getSessions(pair: Pair, day: string): Promise<Sourced<SessionInfo>> {
      const d = dayStartUtc(day);
      const info: SessionInfo = {
        pair, day, approximate: true,
        sessions: [
          { name: "Asia", open: d + 0 * 3600, close: d + 8 * 3600 },
          { name: "London", open: d + 7 * 3600, close: d + 16 * 3600 },
          { name: "NY", open: d + 12 * 3600, close: d + 21 * 3600 },
        ],
      };
      return wrap(info, now, stale);
    },

    async getPositioning(pair: Pair): Promise<Sourced<Positioning>> {
      if (missing) return wrap<Positioning>(null, now, stale);
      // conflict: COT net long vs retail heavily long (crowded) — surfaced by the UI later.
      const data: Positioning = {
        pair,
        cot: { net: conflict ? 25000 : 12000, percentile: 0.7, index: 0.6 },
        retailBook: conflict ? { longPct: 78, shortPct: 22 } : { longPct: 45, shortPct: 55 },
      };
      return wrap(data, now, stale);
    },
  };
}
