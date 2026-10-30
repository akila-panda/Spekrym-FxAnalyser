/** DESK DK0 — all detector defaults in one place (DESK_PHASES.md §D). A detector never hard-codes a
 *  number; it reads from here. Values are starting defaults (approve via OQ-6), editable in DK17.
 *  Units rule (locked): thresholds are in ATR (volatility-adaptive); the UI displays distances in pips. */
import { rulesVersion } from "@/desk/lib/hash";
import type { Methodology } from "@/desk/types/schemas";
import type { Timeframe } from "@/types/market";

export const DEFAULT_METHODOLOGY_VERSION = 1;

export const DEFAULTS = {
  /** Swing strength N per TF; two scales: internal = N, swing = N × 3. */
  swingN: { W: 2, D: 3, H4: 3, H1: 3, M15: 3, M5: 3, M1: 3 } as Record<Timeframe, number>,
  swingScaleMult: 3,
  atrPeriod: 14,
  dispAtr: 1.5,
  dispMaxBars: 3,

  structure: { breakRule: "close" as "close" | "wick", minBreakAtr: 0.1 },

  levels: {
    clusterAtr: 0.5,
    bandCapAtr: 1.5,
    reactAtr: 1.5,
    reactBars: 10,
    minGapBars: 5,
    minReactions: 2,
    minReactionsIntraday: 3,
    strongSingleAtr: 3.0,
    breakAtr: 0.25,
    tfWeight: { W: 1.0, D: 0.8, H4: 0.6, H1: 0.4, M15: 0.25, M5: 0.15, M1: 0.1 } as Record<Timeframe, number>,
  },

  /** Reference levels (DK5). Time-based levels are computed on `baseTf`; sessions are UTC hour ranges (the northern-summer OQ-7 defaults), shifted by the real DST offset per day when `sessionsDst` (DK15); still "approx" until OQ-7 is confirmed. */
  reference: {
    baseTf: "H1" as Timeframe,
    roundPips: 50,
    sessions: { asia: [0, 8], london: [7, 16], ny: [12, 21] } as Record<string, readonly number[]>,
    sessionsDst: true,
    significance: { open: 0.3, session: 0.2, round: 0.05 },
  },

  /** FVG (DK8). fullSizeAtr: gap size at which the size part of the heuristic significance saturates. nearestN: nearest-to-price cap. */
  fvg: { minAtr: 0.25, fillRule: "wick" as "wick" | "close", fullSizeAtr: 1.0, nearestN: 5 },

    /** Liquidity (DK9). Pools = equal swing highs/lows within eqAtr; window counted in trading days (UTC dates that have bars).
   *  followAtr / followBars: follow-through window after a sweep. fullDepthAtr: sweep depth at which the heuristic significance saturates. */
  liquidity: { eqAtr: 0.1, sweepAtr: 0.05, lookbackDays: 5, detectionTf: "H1" as Timeframe, followAtr: 1.5, followBars: 10, fullDepthAtr: 1.0 },

  supplyDemand: {
    baseBarsMin: 1, baseBarsMax: 6, baseAtr: 0.8,
    sdDispAtr: 2.0, dispWithinBars: 3,
    bounds: "body" as "body" | "wick",
    obMergeOverlap: 0.7,
    /** Departure size (ATR) at which the heuristic significance saturates (DK10). */
    fullDepartAtr: 4.0,
  },

    /** Price action (DK11). tlLookbackSwings: how many earlier same-side swings a trendline's first touch may sit back. rangeMinAtr: min range height.
   *  breakAtr: close beyond a range edge to count as a breakout. corrAtr: pullback from an impulse extreme that counts as a correction.
   *  fullImpulseAtr: impulse size at which heuristic significance saturates. pinWickFrac: rejection wick as a fraction of the bar range; signalMinRangeAtr: min bar range for a candle signal. */
  priceAction: {
    tlAtr: 0.3, tlMinTouches: 3, tlKeepPerTf: 2, locAtr: 1.0, rangeAtr: 0.5, failBars: 5,
    tlLookbackSwings: 8, rangeMinAtr: 2.0, breakAtr: 0.25, corrAtr: 1.0, fullImpulseAtr: 4.0, pinWickFrac: 0.6, signalMinRangeAtr: 0.5,
  },

  /** Per-layer object caps by complexity. Minimal is a global total (handled in the pipeline). */
  caps: { minimalTotal: 3, standardPerLayer: 8, advancedPerLayer: 20 },

  /** Projection ladder: source TF → relevance-filter applies on lower TFs. k×ATR(viewTf) of price. */
  relevanceAtr: 3.0,
} as const;

export type MethodologyDefaults = typeof DEFAULTS;

/** The default Methodology object (params + a stable rulesVersion). */
export function defaultMethodology(): Methodology {
  const params = JSON.parse(JSON.stringify(DEFAULTS)) as Record<string, never>;
  return { version: DEFAULT_METHODOLOGY_VERSION, rulesVersion: rulesVersion(DEFAULTS), params };
}