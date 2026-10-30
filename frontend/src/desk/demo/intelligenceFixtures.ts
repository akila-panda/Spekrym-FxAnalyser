/** Explicit synthetic chart fixtures. These illustrate rendering contracts, not model performance.
 * All surfaces consume the same instrument-mapped records; never transplant EUR/USD levels onto JPY. */
import { SAMPLE_ENGINE_OBJECTS, SAMPLE_NOW } from '@/intel/fixtures';
import { STUDIO_SCENARIOS, STUDIO_STATES, STUDIO_FORECASTS } from '@/desk/canvas/scenario/scenarioFixtures';
import { INTEGRATION_INSIGHTS, INTEGRATION_TRADES, INTEGRATION_ELIGIBILITY } from '@/desk/canvas/integration/integrationFixtures';
import { SAMPLE_REGIME_SERIES } from '@/desk/canvas/context/regimeFixtures';
import { buildTimeline } from '@/desk/canvas/timeline/timeline';
import type { AnalysisObject } from '@/desk/types/schemas';
import type { ForecastDistribution, ScenarioSpecification } from '@/intel/contracts';
import { PAIR_META, type Pair, type Candle } from '@/types/market';

const CENTRE: Record<Pair, number> = { EUR_USD: 1.1022, GBP_USD: 1.285, AUD_USD: .662, USD_CAD: 1.365, USD_JPY: 149.5 };
const priceKeys = new Set(['p', 'pHigh', 'pLow', 'entry_price', 'exit_price', 'stop', 'target', 'lo', 'hi']);
export function demoPrice(pair: Pair, p: number): number {
  return Number((CENTRE[pair] + (p - 1.1022) * (pair === 'USD_JPY' ? 100 : 1)).toFixed(PAIR_META[pair].decimals));
}
function mapPair<T>(value: T, pair: Pair): T {
  function map(v: unknown, key = ''): unknown {
    if (typeof v === 'number') return priceKeys.has(key) ? demoPrice(pair, v) : v;
    if (typeof v === 'string') return v.replaceAll('EUR_USD', pair);
    if (Array.isArray(v)) return v.map(x => map(x));
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, map(x, k)]));
    return v;
  }
  return map(value) as T;
}
const base = SAMPLE_ENGINE_OBJECTS[0]!;
function object(id: string, type: AnalysisObject['type'], layer: AnalysisObject['layer'], lo: number, hi: number, hours: number, detector: string): AnalysisObject {
  const t = SAMPLE_NOW - hours * 3600;
  return { ...base, id: `demo:${id}:EUR_USD`, type, layer, t_event: t, known_at: t + 3600,
    geometry: { bands: [{ pLow: lo, pHigh: hi }], anchorTimes: [t] },
    lifecycle: [{ kind: 'established', t, known_at: t + 3600 }],
    provenance: { ...base.provenance, detector } };
}
const objects = [{ ...base, direction: 'bull' as const, grade: { significance: 1, relevance: null, quality: null, freshness: null,
  factors: [{ id: 'touches', value: 2, label: 'Two sample reactions', status: 'supports' as const }] } },
  object('range', 'range', 'levels', 1.1019, 1.104, 15, 'structure'),
  object('supply', 'sd_zone', 'supplyDemand', 1.1042, 1.1048, 12, 'sd'),
  object('gap', 'fvg', 'fvg', 1.1026, 1.1029, 8, 'fvg'),
  object('liquidity', 'liquidity_pool', 'liquidity', 1.104, 1.104, 10, 'session'),
  { ...object('day-open', 'reference_level', 'levels', 1.1032, 1.1032, 22, 'session'), grade: { significance: 1, relevance: null, quality: null, freshness: null, factors: [{ id: 'label', label: 'Day open', status: 'supports' as const }] } },
  { ...object('structure', 'structure_event', 'structure', 1.1018, 1.1034, 7, 'structure'),
    geometry: { bands: [], anchorTimes: [SAMPLE_NOW - 7 * 3600, SAMPLE_NOW - 2 * 3600],
      points: [{ t: SAMPLE_NOW - 7 * 3600, p: 1.1018 }, { t: SAMPLE_NOW - 2 * 3600, p: 1.1034 }] }, known_at: SAMPLE_NOW - 3600 },
] satisfies AnalysisObject[];

const forecastSpec: ScenarioSpecification = {
  ...STUDIO_SCENARIOS[2]!, id: 'scn:demo-envelope', modelRef: 'synthetic-envelope',
  sourceEngine: 'forecast', sourceVersion: 'synthetic-demo',
  branches: [{ label: 'Synthetic forecast display', geometryRefs: [base.id], conditions: ['illustration only'],
    invalidation: 'demo model drift flag', horizon: 86400, expiry: SAMPLE_NOW + 86400 }],
};
const forecast: ForecastDistribution = {
  instrument: 'EUR_USD', asOf: SAMPLE_NOW, horizon: 86400, modelRef: 'synthetic-envelope', modelVersion: 'synthetic-demo',
  interval: { lo: 1.1008, hi: 1.1052 },
  // Synthetic contract example only; displayed with an explicit demo-calibration label.
  calibration: { oosReliability: .8, sharpness: .5, sampleSize: 200 },
};

export function intelligenceFixtures(pair: Pair) {
  const mapped = mapPair({ objects, insights: INTEGRATION_INSIGHTS, regimes: SAMPLE_REGIME_SERIES,
    scenarios: [...STUDIO_SCENARIOS.map(s => ({ ...s, branches: s.branches.map(b => b.label === 'range' ? { ...b, geometryRefs: ['demo:range:EUR_USD'] } : b) })), forecastSpec], states: STUDIO_STATES,
    forecasts: [...STUDIO_FORECASTS, forecast], trades: INTEGRATION_TRADES, eligibility: INTEGRATION_ELIGIBILITY }, pair);
  const candles: Candle[] = [];
  for (let i = 0; i < 120; i++) {
    const open = 1.1027 + Math.sin(i * .39) * .0011 + Math.cos(i * .13) * .0004;
    const close = 1.1027 + Math.sin((i + 1) * .39) * .0011 + Math.cos((i + 1) * .13) * .0004;
    candles.push({ time: SAMPLE_NOW - (120 - i) * 3600, open: demoPrice(pair, open), close: demoPrice(pair, close),
      high: demoPrice(pair, Math.max(open, close) + .00018), low: demoPrice(pair, Math.min(open, close) - .00018), volume: 100 + i % 17 * 20 });
  }
  return { ...mapped, candles, timeline: buildTimeline({ ...mapped, recordedIds: new Set(['ins:1', 'scn:1:v2']) }) };
}
export type IntelligenceFixtures = ReturnType<typeof intelligenceFixtures>;