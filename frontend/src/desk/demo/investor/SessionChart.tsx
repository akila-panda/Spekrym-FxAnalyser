import { useEffect, useMemo, useRef, useState, type Dispatch } from 'react';
import type { ChartApi } from '@/chart/chartApi';
import { BandFillPrimitive } from '@/annotations/primitives/BandFillPrimitive';
import { PAIR_META, TF_ORDER_HIGH_TO_LOW, TF_SECONDS, type Timeframe } from '@/types/market';
import { AnnotatedChart, type ChartFocus } from '../AnnotatedChart';
import { at, candles, forming, price } from './market';
import { chartAnnotations, evidence, projectionEdges } from './intelligence';
import { draftAt, planAt, viewMinute, type Action, type Draft, type Session } from './session';

export function SessionChart({ s, dispatch, focusId, setFocus }: { s: Session; dispatch: Dispatch<Action>; focusId: string; setFocus: (id: string) => void }) {
  const [tf, setTf] = useState<Timeframe>('M5');
  const [api, setApi] = useState<ChartApi | null>(null);
  const [simplify, setSimplify] = useState(false), [forecast, setForecast] = useState(true), [ghost, setGhost] = useState(true);
  const [ys, setYs] = useState<Record<string, number>>({});
  const [parent, setParent] = useState<number | null>(null);
  const [drill, setDrill] = useState<{ tf: Timeframe; parent: number | null }[]>([]);
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ key: 'entry' | 'stop' | 'target'; y: number; value: number; scale: number } | null>(null);
  const minute = viewMinute(s), plan = s.plans.map(p => planAt(p, minute)).find(p => p?.pair === s.pair);
  const d = plan?.draft ?? draftAt(s);
  const editable = s.cursor === null && !plan;
  const bars = useMemo(() => candles(s.pair, s.story, tf, minute), [s.pair, s.story, tf, minute]);
  const annotations = useMemo(() => chartAnnotations(s, { simplify, forecast, ghost, focus: focusId }), [s, simplify, forecast, ghost, focusId]);
  const edges = useMemo(() => projectionEdges(annotations), [annotations]);
  const bands = useMemo(() => annotations.filter(a => a.kind === 'band'), [annotations]);
  const focus = useMemo<ChartFocus | undefined>(() => {
    const selected = evidence(s).find(e => e.id === focusId);
    return selected ? { key: `${selected.id}:${s.pair}:${tf}`, from: at(selected.from), to: at(selected.to), prices: selected.prices } :
      parent !== null ? { key: `parent:${parent}`, from: parent, to: Math.min(at(minute), parent + TF_SECONDS[drill.at(-1)?.tf ?? tf]), prices: [] } : undefined;
  }, [s, focusId, tf, parent, minute, drill]);

  useEffect(() => {
    if (!api) return;
    const prices = [d.entry, d.stop, d.target, ...bands.flatMap(b => [...b.upper, ...b.lower].map(p => p.v ?? NaN))].filter(p => Number.isFinite(p) && p > 0);
    if (!prices.length) return;
    const lo = Math.min(...prices), hi = Math.max(...prices), pad = Math.max(hi - lo, PAIR_META[s.pair].pip * 10) * .15;
    return api.attachPrimitive({ autoscaleInfo: () => ({ priceRange: { minValue: lo - pad, maxValue: hi + pad } }) });
  }, [api, d.entry, d.stop, d.target, s.pair, bands]);

  useEffect(() => {
    if (!api) return;
    const color = getComputedStyle(document.documentElement).getPropertyValue('--role-range').trim();
    const detach = bands.filter(b => b.fill).map(b => api.attachPrimitive(new BandFillPrimitive(
      { getBars: () => api.getCandles(), barSeconds: TF_SECONDS[tf] },
      { upper: b.upper.filter(p => p.v !== null).map(p => ({ time: p.t, price: p.v! })),
        lower: b.lower.filter(p => p.v !== null).map(p => ({ time: p.t, price: p.v! })), color, fillAlpha: .09 })));
    return () => detach.forEach(fn => fn());
  }, [api, bands, tf]);

  useEffect(() => {
    if (!api) return;
    let frame: number;
    const update = () => {
      const next: Record<string, number> = {};
      for (const key of ['entry', 'stop', 'target'] as const) {
        const y = Number.isFinite(d[key]) ? api.priceToY(d[key]) : null;
        if (y !== null && Number.isFinite(y) && y >= 0 && y < (box.current?.clientHeight ?? 0) - 30) next[key] = Math.round(y);
      }
      setYs(old => JSON.stringify(old) === JSON.stringify(next) ? old : next);
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [api, d.entry, d.stop, d.target]);

  const drillIn = () => {
    const index = TF_ORDER_HIGH_TO_LOW.indexOf(tf), child = TF_ORDER_HIGH_TO_LOW[index + 1];
    const last = bars.at(-1);
    if (!child || !last) return;
    setDrill(x => [...x, { tf, parent }]); setParent(last.time); setTf(child); setFocus('');
  };
  const updateDraft = (key: keyof Draft, value: number) => dispatch({ type: 'draft', patch: { [key]: Number(value.toFixed(PAIR_META[s.pair].decimals)) } });
  return <section className="iv-chart-card" aria-label="Shared session chart">
    <div className="iv-toolbar">
      {TF_ORDER_HIGH_TO_LOW.map(t => <button key={t} aria-pressed={tf === t} onClick={() => { setTf(t); setParent(null); setDrill([]); }}>{t}</button>)}
      <button onClick={drillIn} disabled={tf === 'M1'}>Drill latest parent</button>
      <button disabled={!drill.length} onClick={() => { const prev = drill.at(-1)!; setTf(prev.tf); setParent(prev.parent); setDrill(x => x.slice(0, -1)); }}>Back to parent</button>
      <button onClick={() => { setFocus(''); setParent(null); }}>Latest view</button>
    </div>
    <div className="iv-toolbar">
      <label><input type="checkbox" checked={simplify} onChange={e => setSimplify(e.target.checked)} /> Simplify · P0 stays</label>
      <label><input type="checkbox" checked={forecast} onChange={e => setForecast(e.target.checked)} /> Synthetic forecast</label>
      <label><input type="checkbox" checked={ghost} onChange={e => setGhost(e.target.checked)} /> Original forecast history</label>
      <span>{forming(tf, minute) ? 'Final parent is forming from known M1 bars' : 'Closed candles'} · {bars.length} bars</span>
    </div>
    <div className="iv-plot" ref={box}>
      <AnnotatedChart key={`${s.story}:${s.pair}:${tf}`} pair={s.pair} tf={tf} candles={bars} annotations={edges}
        focus={focus} futureBars={Math.ceil((Math.max(at(minute + 35), ...bands.flatMap(b => b.upper.map(p => p.t))) - at(minute)) / TF_SECONDS[tf]) + 3} onApiReady={setApi} />
      {editable && (['entry', 'stop', 'target'] as const).map(key => ys[key] !== undefined && <button key={key}
        className="iv-handle" style={{ top: ys[key] }} aria-label={`Drag ${key}; arrow keys adjust one pip`}
        onKeyDown={e => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); updateDraft(key, d[key] + (e.key === 'ArrowUp' ? 1 : -1) * PAIR_META[s.pair].pip); } }}
        onPointerDown={e => {
          const y0 = api?.priceToY(price(s.pair, 0)), y1 = api?.priceToY(price(s.pair, 10));
          if (y0 == null || y1 == null || y0 === y1) return;
          e.preventDefault(); e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { key, y: e.clientY, value: d[key], scale: 10 * PAIR_META[s.pair].pip / (y1 - y0) };
        }}
        onPointerMove={e => { const a = drag.current; if (a?.key === key) updateDraft(key, a.value + (e.clientY - a.y) * a.scale); }}
        onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
        ↕ {key} {d[key].toFixed(PAIR_META[s.pair].decimals)}
      </button>)}
    </div>
    <p className="iv-muted">One synthetic M1 tape across all chapters. D/W use the app’s fixed UTC anchors; continuous sample calendar. Forecasts occupy future space, never future candles. {editable ? 'Drag handles or use the Plan inputs.' : 'Frozen plan / historical inspection: handles locked.'}</p>
  </section>;
}
