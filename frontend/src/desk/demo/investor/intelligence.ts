import type { Annotation } from '@/types/annotations';
import { PAIR_META } from '@/types/market';
import { at, barAt, price } from './market';
import { defaultDraft, draftAt, gates, hazardOn, planAt, viewMinute, type Session } from './session';

export interface Evidence { id: string; label: string; explanation: string; minute: number; from: number; to: number; prices: number[]; annotations: Annotation[]; p0: boolean }
const base = (id: string, minute: number, role = 'context') => ({ id, known_at: at(minute), role, tone: 'neutral' as const, source_tf: 'M1' as const, step: 0, emphasis: 'normal' as const });
const level = (id: string, minute: number, p: number, end: number, label: string, role: string): Annotation =>
  ({ ...base(id, minute, role), kind: 'level', t0: at(minute), t1: at(end), price: p, label, dash: 'dashed' });

function geometryDraft(s: Session) {
  const p = s.plans.map(p => planAt(p, viewMinute(s))).find(p => p?.pair === s.pair);
  const d = p?.draft ?? draftAt(s);
  return Object.values(d).every(Number.isFinite) ? d : defaultDraft(s.pair);
}

export function evidence(s: Session): Evidence[] {
  const minute = viewMinute(s), pair = s.pair, close = barAt(pair, s.story, minute).close;
  const d = geometryDraft(s), end = Math.max(minute, 60);
  const editedAt = s.edits.filter(e => e.pair === pair && e.minute <= minute).at(-1)?.minute ?? 0;
  const out: Evidence[] = [
    { id: 'support', label: 'Observed · support zone', minute: 0, from: -60, to: minute,
      prices: [price(pair, -13), price(pair, -10)], p0: false,
      explanation: 'Scripted historical support at −13 to −10 pips from the reference. This is observed sample geometry, not a forecast.',
      annotations: [{ ...base('support', 0, 'range'), kind: 'zone', t0: at(-60), t1: at(Math.max(1, minute)), p_low: price(pair, -13), p_high: price(pair, -10), label: 'Support · sample' }] },
    { id: 'trigger', label: 'Condition · close above trigger', minute: editedAt, from: editedAt, to: end, prices: [d.entry], p0: false,
      explanation: `${close >= d.entry ? 'Latest M1 close is above' : 'Waiting for an M1 close above'} ${d.entry.toFixed(PAIR_META[pair].decimals)}. This condition is distinct from an intrabar paper-order fill.`,
      annotations: [level('trigger', editedAt, d.entry, end, 'Conditional trigger', 'entry')] },
    { id: 'invalidation', label: 'P0 · invalidation', minute: editedAt, from: editedAt, to: end, prices: [d.stop], p0: true,
      explanation: `The long thesis fails at ${d.stop.toFixed(PAIR_META[pair].decimals)}. This boundary remains visible when other overlays are simplified.`,
      annotations: [level('invalidation', editedAt, d.stop, end, 'P0 · invalidation', 'stop')] },
    { id: 'target', label: 'Scenario · conditional target', minute: editedAt, from: editedAt, to: end, prices: [d.target], p0: false,
      explanation: 'A planned destination if the thesis holds. It is not a guaranteed outcome or a probability.',
      annotations: [level('target', editedAt, d.target, end, 'Conditional target', 'target')] },
  ];
  if (minute >= 25 && barAt(pair, s.story, 25).low < price(pair, -13)) out.push({ id: 'sweep', label: 'Observed · liquidity sweep', minute: 25, from: 24, to: 30,
    prices: [barAt(pair, s.story, 25).low], p0: false,
    explanation: 'The scripted 07:24 M1 candle is now closed. Its low is an inspectable sample event; recovery must be assessed separately.',
    annotations: [{ ...base('sweep', 25, 'sweep'), kind: 'marker', t0: at(24), price: barAt(pair, s.story, 25).low, shape: 'circle', label: 'Sweep · closed M1' }] });
  if (minute >= 30) out.push({ id: 'recovery', label: 'Interpretation · recovery / conflict', minute: 30, from: 25, to: 30,
    prices: [barAt(pair, s.story, 25).close, barAt(pair, s.story, 30).close], p0: false,
    explanation: 'Compare the two closed sample candles. Recovery on M1 does not establish higher-timeframe agreement; that remains a separate check.',
    annotations: [{ ...base('recovery', 30, 'structure'), kind: 'line', points: [{ t: at(24), p: barAt(pair, s.story, 25).close }, { t: at(29), p: barAt(pair, s.story, 30).close }], label: 'Closed-bar change' }] });
  return out;
}
export function forecastRecords(s: Session) {
  const pair = s.pair, story = s.story, minute = viewMinute(s);
  return [30, 70].filter(issue => issue <= minute && !hazardOn(s, 'feed', issue)).map(issue => {
    const origin = barAt(pair, story, issue).close, prior = barAt(pair, story, issue - 10).close;
    const midpoint = origin + (origin - prior) * 2;
    return { id: `forecast:${pair}:${issue}`, issue, end: 110, origin, midpoint,
      low: midpoint - 12 * PAIR_META[pair].pip, high: midpoint + 12 * PAIR_META[pair].pip };
  });
}
export function regime(s: Session) {
  const m = viewMinute(s), pair = s.pair, a = barAt(pair, s.story, Math.max(0, m - 20)), b = barAt(pair, s.story, m);
  const pips = (b.close - a.close) / PAIR_META[pair].pip;
  return { structure: pips > 3 ? 'Rising' : pips < -3 ? 'Falling' : 'Ranging',
    quality: hazardOn(s, 'feed', m) ? 'Stale' : 'Available',
    explanation: `${pips.toFixed(1)} pip change over the last ${Math.min(20, m)} simulated minutes. Descriptive sample rule, not a production classifier.` };
}
export function chartAnnotations(s: Session, options: { simplify: boolean; forecast: boolean; ghost: boolean; focus?: string }): Annotation[] {
  const m = viewMinute(s), pair = s.pair;
  const out: Annotation[] = evidence(s).filter(e => !options.simplify || e.p0 || e.id === options.focus)
    .flatMap(e => e.annotations.map(a => ({ ...a, label: `${e.id === options.focus ? '◎ ' : ''}${a.label ?? ''}`, emphasis: e.id === options.focus ? 'strong' as const : a.emphasis })));
  const visiblePlans = s.plans.map(p => planAt(p, m)).filter(p => p?.pair === pair);
  const current = visiblePlans[0], d = geometryDraft(s);
  const r = regime(s);
  if (!options.simplify) {
    out.push({ ...base('regime', m), kind: 'text', t0: at(Math.max(0, m - 20)), price: price(pair, 30), label: `Interpretation · ${r.structure} / ${r.quality}` });
    if (barAt(pair, s.story, m).close > d.stop) out.push({ ...base('scenario', m, 'target'), kind: 'line', dash: 'dashed', label: 'If thesis holds · no probability',
      points: [{ t: at(m), p: barAt(pair, s.story, m).close }, { t: at(m + 15), p: d.entry }, { t: at(m + 30), p: d.target }] });
    if (options.forecast) {
      const records = forecastRecords(s);
      const withheld = hazardOn(s, 'feed', m);
      for (const [i, f] of records.entries()) {
        const ghost = i < records.length - 1 || withheld || m > f.end;
        if (ghost && !options.ghost) continue;
        const points = Array.from({ length: f.end - f.issue + 1 }, (_, n) => ({ t: at(f.issue + n), progress: n / (f.end - f.issue) }));
        out.push({ ...base(f.id, f.issue, 'range'), kind: 'band', pane: 'price', fill: !ghost, emphasis: ghost ? 'faint' : 'normal',
          upper: points.map(p => ({ t: p.t, v: f.origin + (f.high - f.origin) * p.progress })),
          mid: points.map(p => ({ t: p.t, v: f.origin + (f.midpoint - f.origin) * p.progress })),
          lower: points.map(p => ({ t: p.t, v: f.origin + (f.low - f.origin) * p.progress })) });
        out.push({ ...base(`${f.id}:label`, f.issue), kind: 'text', t0: at(f.issue), price: f.high,
          label: `${ghost ? 'Historical' : 'Current'} synthetic interval · issued +${f.issue}m` });
      }
    }
  }
  if (s.story === 'protect') out.push({ ...base('news-window', 0, 'stop'), kind: 'window', t0: at(48), t1: at(85), label: 'P0 · scheduled sample news blackout' });
  const reasons = gates(s, pair, d, m, current?.id);
  if (reasons.length) out.push({ ...base('gate', m, 'stop'), kind: 'text', t0: at(m), price: price(pair, -24), label: `P0 · BLOCKED: ${reasons[0]}` });
  for (const p of visiblePlans) {
    if (!p?.fill) continue;
    out.push({ ...base(`${p.id}:fill`, p.fill.minute, 'entry'), kind: 'trade', t0: at(p.fill.minute - 1), t1: at(Math.max(p.fill.minute, p.exit?.minute ?? m)),
      direction: 'long', entry: p.fill.price, stop: p.draft.stop, target: p.draft.target, label: 'Simulated execution · costs included' });
    if (p.exit) out.push({ ...base(`${p.id}:exit`, p.exit.minute), kind: 'text', t0: at(p.exit.minute - 1), price: p.exit.price, label: `Simulated ${p.exit.reason} · ${p.exit.r.toFixed(2)}R` });
  }
  return out;
}
export function researchAt(minute: number) {
  return [
    { minute: 85, title: 'Brain proposal', detail: 'Investigate whether the recovery condition survives transaction costs. Proposal only.' },
    { minute: 90, title: 'Recorded human authorization', detail: 'Fixture of a human authorizing one experiment. No UI control grants permission.' },
    { minute: 95, title: 'Registered experiment', detail: 'Sample version demo-v1; predeclared cost gate; 1 variant; locked holdout, 0 consultations.' },
    { minute: 100, title: 'Validation report', detail: 'Synthetic example: train +0.4R, validation −0.2R per trade after costs. Illustrative numbers, not measured results.' },
    { minute: 110, title: 'Judge: FAIL · no promotion', detail: 'The sample validation gate fails. Strategy stays research-only; no live deployment or model learning occurs.' },
  ].filter(e => e.minute <= minute);
}
/** Projection edges use primitives so minute-level forecast samples never insert new
 * native time-axis slots into H1/H4/D charts. SessionChart attaches the matching fill. */
export function projectionEdges(annotations: readonly Annotation[]): Annotation[] {
  return annotations.flatMap(a => a.kind !== 'band' ? [a] : (['upper', 'mid', 'lower'] as const).map(edge => ({
    ...base(`${a.id}:${edge}`, (a.known_at - at(0)) / 60, a.role), kind: 'line' as const,
    emphasis: a.emphasis, dash: 'dashed' as const,
    points: (a[edge] ?? []).filter(p => p.v !== null).map(p => ({ t: p.t, p: p.v! })),
  })));
}
export function thesis(s: Session) {
  const m = viewMinute(s), p = s.plans.map(p => planAt(p, m)).find(p => p?.pair === s.pair), d = geometryDraft(s);
  const close = barAt(s.pair, s.story, m).close;
  if (close <= d.stop) return 'Invalidated';
  if (gates(s, s.pair, d, m, p?.id).length) return 'Blocked';
  return close >= d.entry ? 'Trigger confirmed on close' : 'Waiting for confirmation';
}
