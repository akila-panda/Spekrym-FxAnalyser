/** Rendering adapter: causal contracts → existing chart Annotations. No trading/model logic. */
import { toAnnotations } from '@/desk/layers/adapter';
import { buildStudio } from '@/desk/canvas/scenario/studio';
import type { Annotation } from '@/types/annotations';
import type { Pair } from '@/types/market';
import { SAMPLE_NOW } from '@/intel/fixtures';
import { demoPrice, type IntelligenceFixtures } from './intelligenceFixtures';

export type FeatureGroup = 'objects' | 'scenarios' | 'forecast' | 'regime' | 'session' | 'trades' | 'risk';
export interface ChartFeature { id: string; group: FeatureGroup; label: string; note: string; p0: boolean; annotations: Annotation[] }
const base = (id: string, known_at: number, role = 'context') => ({ id, known_at, role, tone: 'neutral' as const, source_tf: 'H1' as const, step: 0, emphasis: 'normal' as const });
const text = (id: string, t: number, p: number, label: string, known: number): Annotation => ({ ...base(id, known), kind: 'text', t0: t, price: p, label });
const level = (id: string, t: number, p: number, end: number, label: string, role: string): Annotation =>
  ({ ...base(id, t, role), kind: 'level', t0: t, t1: end, price: p, label, dash: 'dashed' });

export function intelligenceFeatures(scene: IntelligenceFixtures, pair: Pair, asOf: number): ChartFeature[] {
  const out: ChartFeature[] = [];
  const price = (p: number) => demoPrice(pair, p);
  for (const o of scene.objects.filter(o => o.pair === pair && o.known_at <= asOf)) {
    const annotations = toAnnotations([o], { viewTf: 'H1', until: asOf, projected: new Set() }).map(a => o.id.includes('demo:liquidity:') ? { ...a, label: 'Sample liquidity target' } : a);
    out.push({ id: o.id, group: 'objects', label: `● ${annotations[0]?.label ?? o.type}`, note: `Observed sample · known ${new Date(o.known_at * 1000).toISOString().slice(11, 16)} UTC`, p0: false, annotations });
  }
  for (const v of buildStudio(scene.scenarios.filter(s => s.instrument === pair), scene.states, scene.forecasts, asOf)) {
    if (v.status === 'expired') continue;
    if (v.category === 'C') {
      const interval = v.forecast?.interval;
      const annotations: Annotation[] = [];
      if (v.forecast?.state === 'calibrated' && interval) {
        const origin = scene.candles.filter(c => c.time + 3600 <= v.asOf).at(-1)?.close;
        if (origin !== undefined) {
          const end = v.asOf + (v.branches[0]?.horizon ?? 86400);
          const points = Array.from({ length: 25 }, (_, i) => ({ t: v.asOf + i * (end - v.asOf) / 24, f: i / 24 }));
          annotations.push({ ...base(`${v.id}:band`, v.asOf, 'range'), kind: 'band', pane: 'price', fill: true,
            upper: points.map(({ t, f }) => ({ t, v: origin + (interval.hi - origin) * f })),
            mid: points.map(({ t, f }) => ({ t, v: origin + ((interval.hi + interval.lo) / 2 - origin) * f })),
            lower: points.map(({ t, f }) => ({ t, v: origin + (interval.lo - origin) * f })) },
            text(`${v.id}:label`, v.asOf + 3600, interval.hi, '▣ Synthetic envelope · demo calibration only', v.asOf));
        }
      }
      out.push({ id: v.id, group: 'forecast', label: annotations.length ? '▣ Synthetic forecast envelope' : '▣ Forecast withheld',
        note: annotations.length ? 'Illustrative interval; synthetic calibration, no measured predictive performance.' : v.forecast?.reason ?? 'No calibrated interval.', p0: false, annotations });
      continue;
    }
    v.branches.forEach(b => {
      if (b.status === 'expired') return;
      const id = `${v.id}:branch:${b.index}`;
      const origin = scene.candles.filter(c => c.time + 3600 <= v.asOf).at(-1)?.close;
      if (origin === undefined) return;
      const end = Math.min(b.expiry, v.asOf + b.horizon);
      const isRange = b.label === 'range';
      const target = price(isRange ? 1.1025 : 1.104);
      const points = [{ t: v.asOf, p: origin }, { t: v.asOf + (end - v.asOf) / 3, p: price(1.1025) },
        { t: end, p: target }];
      const annotations: Annotation[] = b.status === 'invalidated' ? [] : [
        { ...base(id, v.asOf, 'target'), kind: 'line', points, dash: 'dashed' },
        text(`${id}:label`, v.asOf + (end - v.asOf) * .55, target, `◇ ${b.label} · conditional`, v.asOf),
        level(`${id}:trigger`, v.asOf, price(1.1025), end, isRange ? '◇ Condition: stays inside range' : '◇ Trigger: support + structure', 'entry'),
        level(`${id}:target`, v.asOf, target, end, isRange ? '◇ Range boundary' : '◇ Target: liquidity', 'target'),
      ];
      out.push({ id, group: 'scenarios', label: `◇ ${b.label} (${b.status})`, note: `If ${b.conditions.map(c => c.text).join(' + ')}. No probability. Expires ${new Date(b.expiry * 1000).toISOString().slice(11,16)} UTC.`, p0: false, annotations });
      out.push({ id: `${id}:invalidation`, group: 'risk', label: `⚠ ${b.invalidation.text}`, note: 'P0 · remains visible under Simplify and layer toggles.', p0: true,
        annotations: [level(`${id}:stop`, v.asOf, price(1.1019), end, `⚠ ${b.invalidation.broken ? 'BROKEN' : 'Invalidation'}: ${b.invalidation.text}`, 'stop'), ...(isRange ? [level(`${id}:upper-stop`, v.asOf, price(1.104), end, '⚠ Range invalidation: upper edge', 'stop')] : [])] });
    });
  }
  const regimes = scene.regimes.filter(r => r.instrument === pair && r.available_at <= asOf);
  regimes.forEach((r, i) => {
    const end = Math.min(asOf, regimes[i + 1]?.available_at ?? asOf);
    out.push({ id: r.id, group: 'regime', label: `◈ ${r.structure_state} · ${r.volatility_state}`, note: `Interpretation · ${r.timeframe_alignment} alignment · data ${r.data_quality}`, p0: r.data_quality !== 'valid',
      annotations: [{ ...base(r.id, r.available_at, 'context'), kind: 'window', t0: r.available_at, t1: Math.max(r.available_at + 1, end) },
        text(`${r.id}:label`, r.available_at, price(1.105), `◈ ${r.structure_state}${r.data_quality !== 'valid' ? ' ⚠ degraded' : ''}`, r.available_at)] });
  });
  const day = Math.floor(SAMPLE_NOW / 86400) * 86400;
  for (const [name, start, finish] of [['Asia', 0, 8], ['London', 8, 13], ['New York', 13, 21]] as const) {
    const from = day + start * 3600;
    if (from > asOf) continue;
    out.push({ id: `session:${name}`, group: 'session', label: `${name} session`, note: 'Illustrative fixed UTC session window.', p0: false,
      annotations: [{ ...base(`session:${name}`, from, 'session'), kind: 'window', t0: from, t1: Math.min(asOf, day + finish * 3600) },
        text(`session:${name}:label`, from, price(1.1009), name, from)] });
  }
  for (const i of scene.insights.filter(i => i.instrument === pair && i.availableAt <= asOf)) {
    if (i.kind !== 'risk_warning' || i.status === 'expired' || i.status === 'invalidated' || (i.expiresAt !== undefined && i.expiresAt < asOf)) continue;
    out.push({ id: i.id, group: 'risk', label: '⚠ Macro risk window', note: 'P0 · sample scheduled-event risk; time geometry only.', p0: true,
      annotations: [{ ...base(i.id, i.availableAt, 'stop'), kind: 'window', t0: i.observedAt, t1: i.expiresAt ?? asOf + 3600 },
        text(`${i.id}:label`, i.observedAt, price(1.1055), '⚠ Macro risk', i.availableAt)] });
  }
  for (const tr of scene.trades.filter(t => t.instrument === pair && t.entry_time <= asOf)) {
    const validated = scene.eligibility.some(e => e.instrument === pair && e.strategy_id === tr.strategy_id && e.strategy_version === tr.strategy_version && e.asOf <= asOf && ['validated', 'vault_confirmed'].includes(e.evidence_tier));
    const label = `${tr.category === 'counterfactual' ? '◇ Hypothetical' : validated ? '★ Sample validated' : '◈ Discretionary'} · ${tr.category} ${tr.direction}`;
    const annotations: Annotation[] = [text(tr.trade_id, tr.entry_time, tr.entry_price, label, tr.entry_time)];
    if (tr.stop !== undefined && tr.target !== undefined && tr.category === 'executed') annotations.push({ ...base(`${tr.trade_id}:risk`, tr.entry_time), kind: 'trade', t0: tr.entry_time,
      t1: Math.min(asOf, tr.exit_time ?? asOf), direction: tr.direction, entry: tr.entry_price, stop: tr.stop, target: tr.target });
    if (tr.exit_time !== undefined && tr.exit_time <= asOf && tr.exit_price !== undefined) annotations.push(text(`${tr.trade_id}:exit`, tr.exit_time, tr.exit_price, `${tr.category === 'counterfactual' ? 'Hypothetical ' : ''}Exit`, tr.exit_time));
    out.push({ id: tr.trade_id, group: 'trades', label, note: validated ? 'Synthetic validated-tier example; not a real result.' : 'Sample record · not validated. Hypothetical records are never counted as results.', p0: false, annotations });
  }
  return out;
}