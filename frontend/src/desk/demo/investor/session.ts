/** Local, in-memory demonstration only. No broker, backend, persisted store or research mutation. */
import { PAIR_META, type Pair } from '@/types/market';
import { at, barAt, BASE, END, price, type Story } from './market';

export interface Draft { entry: number; stop: number; target: number; riskPct: number; spread: number; slippage: number }
export type Hazard = 'news' | 'feed' | 'exposure';
export interface Event { id: string; minute: number; pair?: Pair; text: string; kind: 'decision' | 'alert' | 'execution' | 'system' }
export interface Plan {
  id: string; pair: Pair; frozenAt: number; draft: Draft; evidence: string[]; units: number; riskUsd: number;
  submittedAt?: number; blockedAt?: number; reason?: string;
  fill?: { minute: number; price: number };
  exit?: { minute: number; price: number; reason: string; pnl: number; r: number };
}
export interface Session {
  story: Story; clock: number; cursor: number | null; playing: boolean; guided: boolean;
  pair: Pair; drafts: Partial<Record<Pair, Draft>>; accepted: Partial<Record<Pair, string[]>>;
  edits: { pair: Pair; minute: number; draft: Draft }[];
  selections: { pair: Pair; minute: number; ids: string[] }[];
  plans: Plan[]; events: Event[]; alerts: { pair: Pair; threshold: number; armedAt: number; firedAt?: number }[];
  hazards: { kind: Hazard; enabled: boolean; minute: number }[];
}
export const EQUITY = 10000;
export const initial = (story: Story = 'develop'): Session => ({ story, clock: 0, cursor: null, playing: false,
  guided: true, pair: 'EUR_USD', drafts: {}, accepted: {}, edits: [], selections: [], plans: [], events: [], alerts: [], hazards: [] });
export const defaultDraft = (pair: Pair): Draft => ({ entry: BASE[pair], stop: price(pair, -20), target: price(pair, 22), riskPct: .5, spread: 1.2, slippage: .3 });
export const viewMinute = (s: Session) => s.cursor ?? s.clock;
export const draftFor = (s: Session, pair = s.pair) => s.drafts[pair] ?? defaultDraft(pair);
export const draftAt = (s: Session, pair = s.pair, minute = viewMinute(s)) =>
  s.edits.filter(e => e.pair === pair && e.minute <= minute).at(-1)?.draft ?? defaultDraft(pair);
export const acceptedAt = (s: Session) => s.selections.filter(e => e.pair === s.pair && e.minute <= viewMinute(s)).at(-1)?.ids ?? [];
const usdPerQuote = (pair: Pair, quote: number) => PAIR_META[pair].quote === 'USD' ? 1 : 1 / quote;
export function sizing(pair: Pair, d: Draft) {
  const pip = PAIR_META[pair].pip;
  const valid = Object.values(d).every(Number.isFinite) && d.stop > 0 && d.stop < d.entry && d.entry < d.target &&
    d.riskPct > 0 && d.riskPct <= 2 && d.spread >= 0 && d.spread <= 20 && d.slippage >= 0 && d.slippage <= 10;
  const cost = (d.spread + 2 * d.slippage) * pip;
  const riskUsd = Number.isFinite(d.riskPct) && d.riskPct > 0 ? EQUITY * d.riskPct / 100 : 0;
  const units = valid ? Math.floor(riskUsd / ((d.entry - d.stop + cost) * usdPerQuote(pair, d.entry))) : 0;
  return { valid, units, riskUsd, costUsd: units * cost * usdPerQuote(pair, d.entry),
    rewardRisk: valid ? (d.target - d.entry - cost) / (d.entry - d.stop + cost) : 0 };
}
export function planAt(p: Plan, minute: number): Plan | null {
  if (p.frozenAt > minute) return null;
  return { ...p, submittedAt: p.submittedAt !== undefined && p.submittedAt <= minute ? p.submittedAt : undefined,
    blockedAt: p.blockedAt !== undefined && p.blockedAt <= minute ? p.blockedAt : undefined,
    reason: p.blockedAt !== undefined && p.blockedAt <= minute ? p.reason : undefined,
    fill: p.fill && p.fill.minute <= minute ? p.fill : undefined, exit: p.exit && p.exit.minute <= minute ? p.exit : undefined };
}
export function hazardOn(s: Session, kind: Hazard, minute: number): boolean {
  const injected = s.hazards.filter(h => h.kind === kind && h.minute <= minute).at(-1)?.enabled ?? false;
  const scheduled = s.story === 'protect' && (kind === 'news' ? minute >= 48 && minute < 85 : kind === 'feed' && minute >= 65 && minute < 75);
  return injected || scheduled;
}
export function exposure(s: Session, minute: number) {
  const result: Record<string, number> = {};
  for (const original of s.plans) {
    const p = planAt(original, minute);
    if (!p?.fill || p.exit) continue;
    const meta = PAIR_META[p.pair], usd = p.units * p.fill.price * usdPerQuote(p.pair, p.fill.price);
    result[meta.base] = (result[meta.base] ?? 0) + usd;
    result[meta.quote] = (result[meta.quote] ?? 0) - usd;
  }
  return result;
}
export function gates(s: Session, pair: Pair, d: Draft, minute = s.clock, excludeId?: string): string[] {
  const size = sizing(pair, d), reasons: string[] = [];
  if (!size.valid) reasons.push('Invalid long plan: stop < entry < target; risk 0–2%; nonnegative bounded costs required.');
  if (hazardOn(s, 'news', minute)) reasons.push('Scheduled news blackout: new simulated entries blocked.');
  if (hazardOn(s, 'feed', minute)) reasons.push('Stale feed: new entries and current forecasts withheld.');
  if (hazardOn(s, 'exposure', minute)) reasons.push('Injected currency exposure limit: new entries blocked.');
  const other = { ...s, plans: s.plans.filter(p => p.id !== excludeId) };
  const openRisk = other.plans.map(p => planAt(p, minute)).reduce((sum, p) => sum + (p?.fill && !p.exit ? p.riskUsd : 0), 0);
  if (openRisk + size.riskUsd > EQUITY * .01 + .001) reasons.push('Combined open risk exceeds the sample 1% account limit.');
  const x = exposure(other, minute), meta = PAIR_META[pair], usd = size.units * d.entry * usdPerQuote(pair, d.entry);
  if (Math.abs((x[meta.base] ?? 0) + usd) > 40000 || Math.abs((x[meta.quote] ?? 0) - usd) > 40000)
    reasons.push('Combined currency exposure exceeds the sample $40,000 equivalent cap.');
  return reasons;
}
function event(s: Session, text: string, kind: Event['kind'] = 'decision', pair?: Pair): Session {
  return { ...s, events: [...s.events, { id: `event:${s.events.length + 1}`, minute: s.clock, text, kind, pair }] };
}
function freeze(s: Session, pair: Pair): Session {
  if (s.plans.some(p => p.pair === pair)) return s;
  const draft = { ...draftFor(s, pair) }, size = sizing(pair, draft);
  if (!size.valid) return event(s, 'Plan not frozen: invalid inputs.', 'decision', pair);
  const p: Plan = { id: `${s.story}:${pair}:plan`, pair, frozenAt: s.clock, draft,
    evidence: [...(s.accepted[pair] ?? [])], units: size.units, riskUsd: size.riskUsd };
  return event({ ...s, plans: [...s.plans, p] }, 'Plan frozen with evidence, prices and cost assumptions.', 'decision', pair);
}
function submit(s: Session, pair: Pair): Session {
  const p = s.plans.find(p => p.pair === pair);
  if (!p || p.submittedAt !== undefined) return s;
  const reason = gates(s, pair, p.draft, s.clock, p.id).join(' ');
  const next = { ...p, submittedAt: s.clock, ...(reason ? { blockedAt: s.clock, reason } : {}) };
  return event({ ...s, plans: s.plans.map(x => x.id === p.id ? next : x) }, reason || 'Conditional paper order armed; evaluates subsequent M1 bars only.', 'execution', pair);
}
function step(s: Session): Session {
  if (s.clock >= END) return { ...s, playing: false };
  let next: Session = { ...s, clock: s.clock + 1, cursor: null };
  if (next.guided && next.clock === 35 && !next.plans.some(p => p.pair === 'EUR_USD')) {
    const ids = ['support', 'trigger', 'invalidation'];
    next = freeze({ ...next, accepted: { ...next.accepted, EUR_USD: ids }, selections: [...next.selections, { pair: 'EUR_USD', minute: next.clock, ids }] }, 'EUR_USD');
  }
  if (next.guided && next.clock === 45) {
    next = submit(next, 'EUR_USD');
    if (!next.alerts.some(a => a.pair === 'EUR_USD')) next = { ...next, alerts: [...next.alerts, { pair: 'EUR_USD', threshold: next.plans.find(p => p.pair === 'EUR_USD')?.draft.entry ?? BASE.EUR_USD, armedAt: next.clock }] };
  }
  for (const alert of next.alerts) {
    if (alert.firedAt === undefined && alert.armedAt < next.clock && barAt(alert.pair, next.story, next.clock).close >= alert.threshold) {
      next = event({ ...next, alerts: next.alerts.map(a => a === alert ? { ...a, firedAt: next.clock } : a) }, 'Alert: M1 close above sample trigger. Inspect this candle.', 'alert', alert.pair);
    }
  }
  for (const old of [...next.plans]) {
    if (old.submittedAt === undefined || old.submittedAt >= next.clock || old.blockedAt !== undefined || old.exit) continue;
    let p = { ...old };
    const bar = barAt(p.pair, next.story, next.clock), d = p.draft;
    const friction = (d.spread / 2 + d.slippage) * PAIR_META[p.pair].pip;
    if (!p.fill) {
      const reason = gates(next, p.pair, d, next.clock, p.id).join(' ') || (bar.low <= d.stop && bar.high < d.entry ? 'Invalidation reached before entry.' : '');
      if (reason) { p = { ...p, blockedAt: next.clock, reason }; next = event(next, reason, 'execution', p.pair); }
      else if (bar.high >= d.entry) {
        // Recheck gap risk against the frozen budget before admitting a simulated fill.
        const fill = Math.max(d.entry, bar.open) + friction;
        const loss = (fill - d.stop + friction) * p.units * usdPerQuote(p.pair, fill);
        if (loss > p.riskUsd * 1.001 || fill >= d.target) {
          p = { ...p, blockedAt: next.clock, reason: 'Gap or costs exceed the frozen risk budget.' };
          next = event(next, p.reason!, 'execution', p.pair);
        } else { p = { ...p, fill: { minute: next.clock, price: fill } }; next = event(next, 'Simulated long fill; spread and slippage included.', 'execution', p.pair); }
      }
    }
    if (!p.fill && p.blockedAt === undefined && next.clock === END) {
      p = { ...p, blockedAt: next.clock, reason: 'Session ended before entry.' };
      next = event(next, p.reason!, 'execution', p.pair);
    }
    if (p.fill) {
      // Conservative same-bar ambiguity: stop takes precedence over target, including entry bars.
      const reason = bar.low <= d.stop ? 'Stop' : bar.high >= d.target ? 'Target' : next.clock === END ? 'Session close' : '';
      if (reason) {
        const raw = reason === 'Stop' ? Math.min(d.stop, bar.open) : reason === 'Target' ? d.target : bar.close;
        const exitPrice = raw - friction, pnl = (exitPrice - p.fill.price) * p.units * usdPerQuote(p.pair, exitPrice);
        p = { ...p, exit: { minute: next.clock, price: exitPrice, reason, pnl, r: pnl / p.riskUsd } };
        next = event(next, `Simulated exit: ${reason}.`, 'execution', p.pair);
      }
    }
    next = { ...next, plans: next.plans.map(x => x.id === p.id ? p : x) };
  }
  const milestones: Record<number, string> = { 25: 'EUR/USD sample liquidity sweep observed.', 30: hazardOn(next, 'feed', 30) ? 'Forecast issuance withheld: stale sample feed.' : 'Recovery observed; first synthetic forecast issued.',
    50: 'Sample trigger tested; inspect confirmation and conflicts.', 70: 'Forecast revision checkpoint; original remains immutable.',
    85: 'Brain proposal available.', 90: 'Recorded sample human authorization available.', 95: 'Sample experiment registered; holdout remains locked.',
    100: 'Sample validation job completed.', 110: 'Sample verdict FAIL: promotion withheld.' };
  if (milestones[next.clock]) next = event(next, milestones[next.clock]!, 'system');
  if (next.story === 'protect' && [48, 65, 75, 85].includes(next.clock)) next = event(next,
    ({ 48: 'News blackout started.', 65: 'Feed degraded; prediction withheld.', 75: 'Feed recovered; gap checks complete.', 85: 'News blackout ended.' })[next.clock]!, 'system');
  return { ...next, playing: next.clock < END && next.playing };
}
export type Action = { type: 'reset'; story: Story } | { type: 'advance'; to?: number } | { type: 'play' } |
  { type: 'seek'; minute: number | null } | { type: 'pair'; pair: Pair } | { type: 'guided'; value: boolean } |
  { type: 'draft'; patch: Partial<Draft> } | { type: 'accept'; id: string } | { type: 'freeze' } | { type: 'submit' } |
  { type: 'arm' } | { type: 'hazard'; kind: Hazard };
export function reduce(s: Session, action: Action): Session {
  if (action.type === 'reset') return initial(action.story);
  if (action.type === 'seek') return { ...s, cursor: action.minute === null ? null : Math.max(0, Math.min(s.clock, action.minute)), playing: false };
  if (action.type === 'pair') return { ...s, pair: action.pair };
  if (action.type === 'play') return { ...s, cursor: null, playing: s.clock < END && !s.playing };
  if (s.cursor !== null) return s; // Historical inspection cannot mutate a later decision.
  if (action.type === 'advance') {
    const to = Math.min(END, Math.max(s.clock, Math.floor(action.to ?? s.clock + 1)));
    let next = s; while (next.clock < to) next = step(next); return next;
  }
  if (action.type === 'guided') return { ...s, guided: action.value };
  if (action.type === 'draft') {
    if (s.plans.some(p => p.pair === s.pair)) return s;
    const draft = { ...draftFor(s), ...action.patch };
    return { ...s, drafts: { ...s.drafts, [s.pair]: draft }, edits: [...s.edits, { pair: s.pair, minute: s.clock, draft }] };
  }
  if (action.type === 'accept') {
    const ids = s.accepted[s.pair] ?? [];
    if (s.plans.some(p => p.pair === s.pair)) return s;
    const chosen = ids.includes(action.id) ? ids.filter(id => id !== action.id) : [...ids, action.id];
    return event({ ...s, accepted: { ...s.accepted, [s.pair]: chosen }, selections: [...s.selections, { pair: s.pair, minute: s.clock, ids: chosen }] }, `Evidence ${ids.includes(action.id) ? 'removed' : 'accepted'}: ${action.id}.`, 'decision', s.pair);
  }
  if (action.type === 'freeze') return freeze(s, s.pair);
  if (action.type === 'submit') return submit(s, s.pair);
  if (action.type === 'arm') {
    const threshold = s.plans.find(p => p.pair === s.pair)?.draft.entry ?? draftFor(s).entry;
    if (!Number.isFinite(threshold) || threshold <= 0 || s.alerts.some(a => a.pair === s.pair)) return s;
    return event({ ...s, alerts: [...s.alerts, { pair: s.pair, threshold, armedAt: s.clock }] }, `Alert armed: future M1 close above ${threshold}. Threshold frozen at arming.`, 'decision', s.pair);
  }
  if (action.type === 'hazard') {
    const enabled = !(s.hazards.filter(h => h.kind === action.kind).at(-1)?.enabled ?? false);
    return event({ ...s, hazards: [...s.hazards, { kind: action.kind, enabled, minute: s.clock }] }, `Presenter ${enabled ? 'injected' : 'cleared'} ${action.kind} condition.`, 'system');
  }
  return s;
}
export const visibleEvents = (s: Session) => s.events.filter(e => e.minute <= viewMinute(s));
export function sessionExport(s: Session) {
  const minute = viewMinute(s);
  return JSON.stringify({ label: 'SYNTHETIC DEMO — not live results', version: 1, story: s.story, asOf: at(minute),
    assumptions: 'USD 10,000 account; long-only conditional orders; explicit costs; conservative same-bar stop precedence; no performance claim.',
    plans: s.plans.map(p => planAt(p, minute)).filter(Boolean), events: visibleEvents(s) }, null, 2);
}
