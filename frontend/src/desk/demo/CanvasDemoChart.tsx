import { useMemo, useState } from 'react';
import type { Annotation } from '@/types/annotations';
import type { Pair } from '@/types/market';
import type { ComposedOverlay } from '@/desk/canvas/pipeline';
import { useScenarioStore } from '@/desk/canvas/scenario/scenarioStore';
import { AnnotatedChart, type ChartFocus } from './AnnotatedChart';
import { intelligenceFeatures, type ChartFeature, type FeatureGroup } from './intelligenceChartModel';
import type { IntelligenceFixtures } from './intelligenceFixtures';
import '@/styles/demo.css';

const GROUPS: [FeatureGroup, string][] = [['objects', 'Objects'], ['scenarios', 'Scenarios'], ['forecast', 'Forecast'], ['regime', 'Regimes'], ['session', 'Sessions'], ['trades', 'Trade evidence']];
function annotationFocus(feature: ChartFeature): ChartFocus | undefined {
  const ts: number[] = [], prices: number[] = [];
  for (const a of feature.annotations) {
    if ('t0' in a) ts.push(a.t0);
    if ('t1' in a && typeof a.t1 === 'number') ts.push(a.t1);
    if ('price' in a) prices.push(a.price);
    if (a.kind === 'band') { ts.push(...a.upper.map(p => p.t)); prices.push(...[...a.upper, ...a.lower].flatMap(p => p.v === null ? [] : [p.v])); }
    if (a.kind === 'zone') prices.push(a.p_low, a.p_high);
    if (a.kind === 'line') { ts.push(...a.points.map(p => p.t)); prices.push(...a.points.map(p => p.p)); }
  }
  return ts.length ? { key: feature.id, from: Math.min(...ts), to: Math.max(...ts), prices } : undefined;
}
export function CanvasDemoChart({ scene, pair, asOf, displayed, queryFocus, selectedIds, source, hiddenEngines, itemFocus, locatedItem, onShowAll }: {
  itemFocus: readonly string[]; locatedItem: string | null; onShowAll: () => void;
  scene: IntelligenceFixtures; pair: Pair; asOf: number; displayed: readonly ComposedOverlay[];
  queryFocus: readonly string[]; selectedIds: readonly string[]; source: string | null; hiddenEngines: readonly string[];
}) {
  const [hidden, setHidden] = useState<FeatureGroup[]>([]);
  const [simplify, setSimplify] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [reset, setReset] = useState(0);
  const scenarioId = useScenarioStore(s => s.scenarioId);
  const branch = useScenarioStore(s => s.branch);
  const features = useMemo(() => intelligenceFeatures(scene, pair, asOf), [scene, pair, asOf]);
  const candles = useMemo(() => scene.candles.filter(c => c.time + 3600 <= asOf), [scene, asOf]);
  const objectIds = new Set(displayed.flatMap(o => o.primary.geometryRefs));
  const shown = features.filter(f => f.p0 || (!simplify && !hidden.includes(f.group) &&
    (f.group !== 'objects' || objectIds.has(f.id)) &&
    !(f.group === 'scenarios' && hiddenEngines.includes('scenario')) && !(f.group === 'forecast' && hiddenEngines.includes('forecast'))));
  const queried = new Set(displayed.filter(o => queryFocus.includes(o.key)).flatMap(o => o.primary.geometryRefs));
  const matches = (f: ChartFeature, id: string | null) => Boolean(id && (id === f.id || f.id.startsWith(`${id.replace(/:v\d+$/, '')}:branch:`)));
  const focused = (f: ChartFeature) => f.id === focusId || matches(f, locatedItem) || itemFocus.some(id => matches(f, id)) || selectedIds.includes(f.id) || queried.has(f.id) ||
    (scenarioId && (f.id === scenarioId || f.id === `${scenarioId}:branch:${branch}`)) ||
    (source === 'scenarios' && f.group === 'scenarios') || (source === 'regime' && f.group === 'regime') ||
    (source === 'macro' && f.group === 'risk') || (source === 'session' && f.group === 'session') ||
    (source === 'structure' && f.id.includes('structure'));
  const annotations = shown.flatMap(f => f.annotations.map(a => ({ ...a, label: focused(f) && a.label ? `◎ ${a.label}` : a.label, emphasis: focused(f) || f.p0 ? 'strong' as const : 'normal' as const })));
  const focus = useMemo(() => {
    const f = features.find(x => x.id === focusId);
    return f ? annotationFocus(f) : undefined;
  }, [features, focusId]);
  return <section className="demo-intelligence" aria-label="Chart intelligence demo">
    <div className="demo-chart-toolbar">
      <strong>{pair.replace('_', '/')} · H1</strong><span className="dk-sample">synthetic sample</span>
      <span>{new Date(asOf * 1000).toISOString().slice(0, 16).replace('T', ' ')} UTC</span>
      <button onClick={() => { setHidden([]); setSimplify(false); setFocusId(null); setReset(r => r + 1); onShowAll(); }}>Show all intelligence</button>
      <button aria-pressed={simplify} onClick={() => setSimplify(s => !s)}>Simplify · P0 stays</button>
      <button onClick={() => { setFocusId(null); setReset(r => r + 1); }}>Reset chart view</button>
    </div>
    <div className="demo-chart-toolbar" aria-label="Intelligence chart layers">
      {GROUPS.map(([id, label]) => <label key={id}><input type="checkbox" checked={!hidden.includes(id)} onChange={() => setHidden(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])} />{label}</label>)}
      <span className="dk-muted">⚠ Invalidation and risk remain visible</span>
    </div>
    <div className="demo-intelligence-plot">
      <AnnotatedChart pair={pair} tf="H1" candles={candles} annotations={annotations as Annotation[]} futureBars={32} focus={focus} resetKey={String(reset)} />
    </div>
    <p className="demo-chart-caption">● Objects · ◈ Interpretations · ◇ Conditional paths · ▣ Forecast envelope · ★ Sample validated signals. Future space contains projections only; no future candles.</p>
    <div className="demo-feature-grid" aria-label="Visible chart intelligence">
      {shown.map(f => <button key={f.id} data-p0={f.p0} aria-pressed={Boolean(focused(f))} onClick={() => setFocusId(f.id)}>
        <strong>{f.label}</strong><span>{f.note}</span><small>{f.annotations.length ? 'Locate on chart' : 'Context only · no geometry'}</small>
      </button>)}
    </div>
    <p className="dk-muted">All records and calibration examples are synthetic. Brain proposals without price geometry remain in the context panel.</p>
  </section>;
}