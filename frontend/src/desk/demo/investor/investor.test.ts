import { describe, expect, it } from 'vitest';
import { bucketStart, PAIRS, TF_SECONDS, type Timeframe } from '@/types/market';
import { at, barAt, candles, price, tape, type Story } from './market';
import { acceptedAt, defaultDraft, draftAt, exposure, gates, initial, planAt, reduce, sessionExport, sizing } from './session';
import { chartAnnotations, forecastRecords, projectionEdges, researchAt } from './intelligence';

const advance = (story: Story, to: number) => reduce(initial(story), { type: 'advance', to });
describe('shared synthetic market', () => {
  it('aggregates the same known M1 children into every parent without future completion', () => {
    for (const tf of ['M5', 'M15', 'H1', 'H4', 'D', 'W'] as Timeframe[]) {
      const end = at(37), parent = candles('EUR_USD', 'develop', tf, 37).at(-1)!;
      const children = tape('EUR_USD', 'develop').filter(c => c.time + 60 <= end && bucketStart(tf, c.time) === parent.time);
      expect(parent.open).toBe(children[0]!.open);
      expect(parent.close).toBe(children.at(-1)!.close);
      expect(parent.high).toBe(Math.max(...children.map(c => c.high)));
      expect(parent.low).toBe(Math.min(...children.map(c => c.low)));
      expect(parent.volume).toBe(children.reduce((sum, c) => sum + c.volume, 0));
      expect(parent.time + TF_SECONDS[tf]).toBeGreaterThan(end);
    }
  });
  it('keeps every supported instrument on its own price scale', () => {
    for (const pair of PAIRS) {
      const c = barAt(pair, 'develop', 50);
      expect(c.low).toBeLessThanOrEqual(c.close);
      expect(c.high).toBeGreaterThanOrEqual(c.open);
      expect(Math.abs(c.close - price(pair, 0))).toBeLessThan(pair === 'USD_JPY' ? 1 : .01);
    }
  });
});
describe('causal decision and execution simulation', () => {
  it('runs distinct win, blocked and losing stories with immutable plans and costs', () => {
    const win = advance('develop', 120), blocked = advance('protect', 120), loss = advance('review', 120);
    expect(win.plans[0]?.fill).toBeDefined();
    expect(win.plans[0]?.exit?.reason).toBe('Target');
    expect(win.plans[0]?.exit?.pnl).toBeGreaterThan(0);
    expect(blocked.plans[0]?.fill).toBeUndefined();
    expect(blocked.plans[0]?.reason).toContain('news');
    expect(loss.plans[0]?.exit?.reason).toBe('Stop');
    expect(loss.plans[0]?.exit?.r).toBeCloseTo(-1, 2);
    const frozen = win.plans[0]!;
    expect(reduce(win, { type: 'draft', patch: { stop: 1 } }).plans[0]).toEqual(frozen);
    expect(frozen.fill!.price).toBeGreaterThan(frozen.draft.entry);
    expect(frozen.exit!.price).toBeLessThan(frozen.draft.target);
  });
  it('does not fill on the submission bar or rewrite a blocked order after recovery', () => {
    let s = reduce(initial(), { type: 'guided', value: false });
    s = reduce(s, { type: 'advance', to: 55 });
    s = reduce(s, { type: 'freeze' }); s = reduce(s, { type: 'submit' });
    expect(s.plans[0]?.fill).toBeUndefined();
    const b = advance('protect', 120);
    expect(reduce(b, { type: 'submit' }).plans[0]?.fill).toBeUndefined();
  });
  it('evaluates alerts after arming and links them to the same observed candle', () => {
    const s = advance('develop', 70), a = s.alerts[0]!;
    expect(a.firedAt).toBeGreaterThan(a.armedAt);
    expect(barAt(a.pair, s.story, a.firedAt!).close).toBeGreaterThanOrEqual(defaultDraft(a.pair).entry);
    expect(s.events.filter(e => e.kind === 'alert')).toHaveLength(1);
    let manual = reduce(initial(), { type: 'guided', value: false });
    manual = reduce(manual, { type: 'draft', patch: { entry: 1.11 } });
    manual = reduce(manual, { type: 'arm' });
    manual = reduce(manual, { type: 'draft', patch: { entry: 1.10 } });
    manual = reduce(manual, { type: 'advance', to: 120 });
    expect(manual.alerts[0]?.threshold).toBe(1.11);
    expect(manual.alerts[0]?.firedAt).toBeUndefined();
  });
  it('rejects invalid sizing and enforces combined currency exposure', () => {
    expect(sizing('EUR_USD', { ...defaultDraft('EUR_USD'), stop: 2 }).valid).toBe(false);
    expect(sizing('USD_JPY', defaultDraft('USD_JPY')).units).toBeGreaterThan(0);
    const s = advance('develop', 60);
    expect(exposure(s, 60).USD).toBeLessThan(0);
    expect(gates(s, 'GBP_USD', defaultDraft('GBP_USD'))).toContain('Combined currency exposure exceeds the sample $40,000 equivalent cap.');
  });
  it('historical views and exports hide later fills, outcomes, decisions and edits', () => {
    const s = advance('develop', 120), p = s.plans[0]!;
    expect(planAt(p, 34)).toBeNull();
    expect(planAt(p, 40)?.submittedAt).toBeUndefined();
    expect(planAt(p, 40)?.fill).toBeUndefined();
    expect(planAt(p, 60)?.exit).toBeUndefined();
    const replay = reduce(s, { type: 'seek', minute: 40 });
    const exported = JSON.parse(sessionExport(replay));
    expect(exported.events.every((e: { minute: number }) => e.minute <= 40)).toBe(true);
    expect(exported.plans[0].exit).toBeUndefined();
    expect(reduce(replay, { type: 'hazard', kind: 'feed' })).toBe(replay);
    let manual = reduce(initial(), { type: 'guided', value: false });
    manual = reduce(manual, { type: 'advance', to: 60 });
    manual = reduce(manual, { type: 'draft', patch: { target: 1.2 } });
    manual = reduce(manual, { type: 'accept', id: 'support' });
    const past = reduce(manual, { type: 'seek', minute: 20 });
    expect(draftAt(past).target).toBe(defaultDraft('EUR_USD').target);
    expect(acceptedAt(past)).toEqual([]);
  });
  it('reset clears only the in-memory story state', () => {
    localStorage.setItem('unrelated-investor-test', 'keep');
    expect(reduce(advance('develop', 120), { type: 'reset', story: 'protect' })).toEqual(initial('protect'));
    expect(localStorage.getItem('unrelated-investor-test')).toBe('keep');
    localStorage.removeItem('unrelated-investor-test');
  });
});
describe('intelligence, projections and research availability', () => {
  it('uses primitive forecast edges without inserting native time-axis slots', () => {
    const input = chartAnnotations(advance('develop', 70), { simplify: false, forecast: true, ghost: true });
    const bands = input.filter(a => a.kind === 'band'), edges = projectionEdges(input);
    expect(bands).toHaveLength(2);
    expect(edges.some(a => a.kind === 'band' || a.kind === 'series')).toBe(false);
    for (const band of bands) {
      const upper = edges.find(a => a.id === `${band.id}:upper`);
      expect(upper?.kind === 'line' && upper.points).toEqual(band.upper.map(p => ({ t: p.t, p: p.v })));
    }
  });
  it('retains the original forecast and withholds issuance during stale data', () => {
    const early = forecastRecords(advance('develop', 30));
    const late = forecastRecords(advance('develop', 120));
    expect(early).toHaveLength(1); expect(late).toHaveLength(2); expect(late[0]).toEqual(early[0]);
    expect(forecastRecords(advance('protect', 120))).toHaveLength(1);
    let stale = reduce(initial(), { type: 'hazard', kind: 'feed' });
    stale = reduce(stale, { type: 'advance', to: 40 });
    expect(forecastRecords(stale)).toHaveLength(0);
    expect(stale.events.find(e => e.minute === 30)?.text).toContain('withheld');
  });
  it('keeps P0 geometry and never emits future-known annotations during replay', () => {
    const s = advance('protect', 120);
    for (const m of [0, 20, 30, 40, 65, 75, 110]) {
      const replay = reduce(s, { type: 'seek', minute: m });
      const annotations = chartAnnotations(replay, { simplify: false, forecast: true, ghost: true });
      expect(annotations.every(a => a.known_at <= at(m))).toBe(true);
      const simple = chartAnnotations(replay, { simplify: true, forecast: false, ghost: false });
      expect(simple.some(a => a.id === 'invalidation')).toBe(true);
      expect(simple.some(a => a.id === 'news-window')).toBe(true);
      expect(simple.some(a => a.kind === 'band')).toBe(false);
    }
  });
  it('reveals the research chain only at its recorded milestones', () => {
    expect(researchAt(84)).toEqual([]); expect(researchAt(95)).toHaveLength(3);
    expect(researchAt(100).some(x => x.title.includes('FAIL'))).toBe(false);
    expect(researchAt(110).at(-1)?.title).toContain('FAIL');
  });
});
