import { useEffect, useMemo, useState } from 'react';
import { useDeskStore } from '@/desk/workspace/deskStore';
import { deepCandles } from '@/desk/mock/deepMock';
import { useLayerStore } from '@/desk/layers/layerStore';
import { goCursor } from '@/desk/prepare/actions';
import type { PrepareView } from '@/desk/prepare/prepareStore';
import type { Step } from '@/desk/prepare/walk';
import { TF_SECONDS } from '@/types/market';
import { AnnotatedChart } from './AnnotatedChart';
import { prepareAnnotations } from './prepareChartModel';
import '@/styles/demo.css';

export function PrepareChart({ view, step, cursor }: { view: PrepareView; step: Step; cursor: number }) {
  const complexity = useDeskStore(s => s.complexity);
  const settings = useLayerStore(s => s.settings);
  const [showRejected, setShowRejected] = useState(false);
  const [focusVersion, setFocusVersion] = useState(0);
  const [latest, setLatest] = useState(false);
  const items = view.inbox[step];
  const item = items[cursor];
  useEffect(() => setLatest(false), [item?.object.id]);
  const candles = useMemo(() => deepCandles(view.pair, step).filter(c => c.time + TF_SECONDS[step] <= view.asOf), [view.pair, step, view.asOf]);
  const annotations = useMemo(() => prepareAnnotations(items, step, view.asOf, item?.object.id, settings, showRejected, complexity, candles.at(-1)?.close ?? null),
    [items, step, view.asOf, item?.object.id, settings, showRejected, complexity, candles]);
  const focus = useMemo(() => {
    if (!item || latest) return undefined;
    const o = item.object;
    // Reference detectors also encode discriminator integers in anchorTimes; those are not timestamps.
    const anchors = o.geometry.anchorTimes.filter(t => t >= (candles[0]?.time ?? 0) && t <= view.asOf);
    return { key: `${o.id}:${focusVersion}`, from: Math.min(o.t_event, ...anchors) - TF_SECONDS[step], to: Math.max(o.known_at, ...anchors),
      prices: [...o.geometry.bands.flatMap(b => [b.pLow, b.pHigh]), ...(o.geometry.points ?? []).map(p => p.p)] };
  }, [item?.object.id, focusVersion, latest, candles, step, view.asOf]);
  return <section className="demo-prepare-chart" aria-label="Prepare candlestick chart">
    <div className="demo-chart-toolbar">
      <strong>{view.pair.replace('_', '/')} · {step}</strong><span className="dk-sample">sample</span>
      <span className="dk-muted">{candles.length} closed candles · {annotations.length} overlays</span>
      <button onClick={() => { setLatest(false); setFocusVersion(v => v + 1); }} disabled={!item}>Focus candidate</button>
      <button onClick={() => { setLatest(true); setFocusVersion(v => v + 1); }}>Latest candles</button>
      <label><input type="checkbox" checked={showRejected} onChange={e => setShowRejected(e.target.checked)} /> Show rejected</label>
      <a href={`?window=canvas&demo=1&pair=${view.pair}&canvasMode=prepare`} target="_blank" rel="noopener noreferrer">Open full intelligence demo ↗</a>
    </div>
    <div className="demo-prepare-plot"><AnnotatedChart key={`${view.pair}:${step}`} pair={view.pair} tf={step} candles={candles} annotations={annotations}
      focus={focus} resetKey={latest ? `${step}:${cursor}:${focusVersion}` : undefined} /></div>
    <div className="demo-chart-toolbar demo-candidate-strip" aria-label="Chart candidates">
      {items.map((it, i) => <button key={it.object.id} aria-pressed={i === cursor} onClick={() => { setLatest(false); goCursor(i); }}>
        {it.triage === 'accept' ? '✓' : it.triage === 'reject' ? '✗' : it.triage === 'revisit' ? '?' : '○'} {i + 1}{it.custom ? ' Custom' : ''}
      </button>)}
    </div>
    <p className="dk-muted">Inbox selection highlights the same geometry here. Selected candidates stay visible when their layer is off. Each timeframe uses its own sample series.</p>
  </section>;
}