import { useEffect, useReducer, useState } from 'react';
import { PAIRS } from '@/types/market';
import { END, stamp, STORIES, type Story } from './market';
import { initial, reduce, sessionExport, viewMinute, visibleEvents } from './session';
import { SessionChart } from './SessionChart';
import { CHAPTERS, SessionPanels, type Chapter } from './SessionPanels';
import './investor.css';

export function InvestorDemo({ onGallery }: { onGallery: () => void }) {
  const [s, dispatch] = useReducer(reduce, undefined, () => initial());
  const [chapter, setChapter] = useState<Chapter>('Scan');
  const [focus, setFocus] = useState('');
  const [speed, setSpeed] = useState(1);
  const [generation, setGeneration] = useState(0);
  const m = viewMinute(s), replay = s.cursor !== null;
  useEffect(() => {
    if (!s.playing) return;
    const timer = window.setInterval(() => dispatch({ type: 'advance' }), 600 / speed);
    return () => window.clearInterval(timer);
  }, [s.playing, speed]);
  const reset = (story: Story) => { dispatch({ type: 'reset', story }); setChapter('Scan'); setFocus(''); setGeneration(n => n + 1); };
  const download = () => {
    const url = URL.createObjectURL(new Blob([sessionExport(s)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `spekrym-synthetic-${s.story}-${m}.json`; a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <main className="iv-root" aria-label="Investor demonstration">
    <header className="iv-head">
      <div><span className="iv-eyebrow">SPEKRYM–FX / INTERACTIVE WALKTHROUGH</span><h1>From evidence to accountable decisions.</h1>
        <p>Synthetic market and research simulation · no live orders · no validated performance claim.</p></div>
      <button onClick={onGallery}>Standalone feature gallery</button>
    </header>
    <section className="iv-controls" aria-label="Presentation controls">
      <div className="iv-toolbar">
        <label>Story <select value={s.story} onChange={e => reset(e.target.value as Story)}>{Object.entries(STORIES).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>
        <label>Pair <select value={s.pair} onChange={e => { dispatch({ type: 'pair', pair: e.target.value as typeof s.pair }); setFocus(''); }}>{PAIRS.map(p => <option key={p}>{p}</option>)}</select></label>
        <button onClick={() => dispatch({ type: 'play' })} disabled={s.clock >= END}>{s.playing ? 'Pause' : 'Play session'}</button>
        <button onClick={() => dispatch({ type: 'advance' })} disabled={replay || s.clock >= END}>Step 1 minute</button>
        <label>Speed <select value={speed} onChange={e => setSpeed(Number(e.target.value))}><option value={1}>1×</option><option value={4}>4×</option><option value={12}>12×</option></select></label>
        <button onClick={() => reset(s.story)}>Reset story</button>
        <button onClick={download}>Export visible session</button>
      </div>
      <div className="iv-toolbar">
        <label><input type="checkbox" checked={s.guided} disabled={replay} onChange={e => dispatch({ type: 'guided', value: e.target.checked })} /> Guided sample decisions</label>
        <span className="iv-muted">Guided: freeze EUR/USD at +35m; arm paper condition and alert at +45m.</span>
        {[30, 50, 70, 90, 120].map(to => <button key={to} disabled={replay || s.clock >= to} onClick={() => { dispatch({ type: 'advance', to }); setFocus(''); }}>Advance to +{to}m</button>)}
      </div>
      <div className="iv-toolbar">
        <strong>{stamp(m)} · {replay ? 'Historical inspection' : 'Session clock'} · +{m}m</strong>
        <label className="iv-replay">Inspect recorded history <input aria-label="Inspect recorded history" type="range" min={0} max={Math.max(1, s.clock)} value={m} disabled={s.clock === 0}
          onChange={e => { dispatch({ type: 'seek', minute: Number(e.target.value) }); setFocus(''); }} /></label>
        {replay && <button onClick={() => dispatch({ type: 'seek', minute: null })}>Return to session clock</button>}
      </div>
    </section>
    <nav className="iv-chapters" aria-label="Demo chapters">{CHAPTERS.map((name, i) => <button key={name} aria-current={chapter === name ? 'step' : undefined} onClick={() => setChapter(name)}><span>{String(i + 1).padStart(2, '0')}</span> {name}</button>)}</nav>
    <div className="iv-layout">
      <div className="iv-main"><SessionChart key={generation} s={s} dispatch={dispatch} focusId={focus} setFocus={setFocus} />
        <section className="iv-events" aria-label="Decision and change history">
          <div className="iv-toolbar"><h2>What changed—and why?</h2><span className="iv-muted">Click a recorded event to inspect that moment.</span></div>
          <div role="status" aria-live="polite">{visibleEvents(s).at(-1)?.text ?? 'Session ready. Play, step, or inspect the initial evidence.'}</div>
          <ol>{visibleEvents(s).slice().reverse().map(e => <li key={e.id}><button onClick={() => {
            if (e.pair) dispatch({ type: 'pair', pair: e.pair }); dispatch({ type: 'seek', minute: e.minute });
            setFocus(e.kind === 'alert' ? 'trigger' : ''); setChapter(e.kind === 'execution' ? 'Review' : 'Monitor');
          }}><time>{stamp(e.minute)}</time><span>{e.kind} · {e.pair?.replace('_', '/')} {e.text}</span></button></li>)}</ol>
        </section>
      </div>
      <SessionPanels s={s} dispatch={dispatch} chapter={chapter} focusId={focus} focus={setFocus} />
    </div>
    <footer className="iv-footer">Everything in this walkthrough shares one in-memory session. Reset affects this demo only. Standalone feature screens retain their independent sample data.</footer>
  </main>;
}
