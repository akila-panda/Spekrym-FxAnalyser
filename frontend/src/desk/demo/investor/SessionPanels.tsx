import type { Dispatch } from 'react';
import { PAIR_META } from '@/types/market';
import { barAt, opportunities, stamp, strength } from './market';
import { evidence, forecastRecords, regime, researchAt, thesis } from './intelligence';
import { acceptedAt, draftAt, EQUITY, exposure, gates, hazardOn, planAt, sizing, viewMinute, type Action, type Draft, type Session } from './session';

export const CHAPTERS = ['Scan', 'Prepare', 'Intelligence', 'Plan', 'Monitor', 'Review', 'Portfolio', 'Research', 'Ops'] as const;
export type Chapter = typeof CHAPTERS[number];
export const INTRO: Record<Chapter, string> = {
  Scan: 'Compare the same moment across five pairs. Select a row to inspect its chart.',
  Prepare: 'Inspect and accept the evidence that will be frozen with your plan.',
  Intelligence: 'Separate observed facts, conditional scenarios, forecasts and missing confirmation.',
  Plan: 'Edit the long-only paper plan. Every change updates chart geometry and cost-aware sizing.',
  Monitor: 'Watch conditions change. Alerts and paper orders evaluate only subsequent candles.',
  Review: 'Inspect what was known at the decision, separately from the eventual outcome.',
  Portfolio: 'See how open simulated positions combine into shared currency exposure.',
  Research: 'Follow a scripted proposal through authorization, validation and a rejected promotion.',
  Ops: 'Inspect sample feed health and inject a condition to observe its effect on decisions.',
};
const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
interface Props { s: Session; dispatch: Dispatch<Action>; chapter: Chapter; focusId: string; focus: (id: string) => void }

export function SessionPanels({ s, dispatch, chapter, focusId, focus }: Props) {
  const m = viewMinute(s), replay = s.cursor !== null;
  const plans = s.plans.map(p => planAt(p, m)).filter(p => p !== null);
  const plan = plans.find(p => p.pair === s.pair);
  const d = plan?.draft ?? draftAt(s);
  const size = sizing(s.pair, d), reasons = gates(s, s.pair, d, m, plan?.id);
  const items = evidence(s), r = regime(s), forecasts = forecastRecords(s);
  const frozen = !!plan || replay;
  const edit = (key: keyof Draft, value: string) => dispatch({ type: 'draft', patch: { [key]: value.trim() ? Number(value) : NaN } });
  return <section className="iv-panel" aria-label={`${chapter} chapter`}>
    <h2>{chapter}</h2><p className="iv-muted">{INTRO[chapter]}</p>
    {chapter === 'Scan' && <>
      <p>Ranked by observed percentage change since {stamp(0)}. This is a sample comparison, not a recommendation.</p>
      <table><thead><tr><th>Pair</th><th>Change</th><th>Condition</th></tr></thead><tbody>
        {opportunities(s.story, m).map(x => <tr key={x.pair}><td><button aria-pressed={s.pair === x.pair} onClick={() => { dispatch({ type: 'pair', pair: x.pair }); focus(''); }}>{x.pair.replace('_', '/')}</button></td>
          <td>{x.change >= 0 ? '+' : ''}{x.change.toFixed(3)}%</td><td>{x.reason}</td></tr>)}
      </tbody></table>
      <h3>Relative currency strength · sample basket</h3>
      <p className="iv-muted">Mean signed pair returns; unequal coverage across currencies. Descriptive only.</p>
      {strength(s.story, m).map(x => <p className="iv-metric" key={x.ccy}><span>{x.ccy}</span><strong>{x.value >= 0 ? '+' : ''}{x.value.toFixed(3)}%</strong></p>)}
    </>}
    {(chapter === 'Prepare' || chapter === 'Intelligence') && <>
      <p className="iv-status">{thesis(s)}</p>
      {items.map(e => <div className="iv-evidence" key={e.id} data-p0={e.p0}>
        <button aria-pressed={focusId === e.id} onClick={() => focus(e.id)}>{e.label} ↗</button>
        <p>{e.explanation}</p><small>Known at {stamp(e.minute)} · evidence ID {e.id}</small>
        {chapter === 'Prepare' && <label><input type="checkbox" disabled={frozen}
          checked={(plan?.evidence ?? acceptedAt(s)).includes(e.id)}
          onChange={() => dispatch({ type: 'accept', id: e.id })} /> Include in frozen plan</label>}
      </div>)}
      <h3>Conflict / missing confirmation</h3>
      <p>M1 recovery alone does not establish W/D/H4 agreement. Inspect the aggregated parent candles before accepting that thesis.</p>
      {chapter === 'Intelligence' && <>
        <h3>Forecast lifecycle · synthetic interval</h3>
        <p>{hazardOn(s, 'feed', m) ? 'WITHHELD: stale feed. Historical issued records remain inspectable.' : forecasts.length ? m > 110 ? 'Horizon passed: historical forecast records only.' : 'Available synthetic display. No measured calibration or probability claim.' : 'WITHHELD: no forecast issued at this time.'}</p>
        {forecasts.map(f => <div className="iv-evidence" key={f.id}>
          <strong>Issued {stamp(f.issue)} → horizon {stamp(f.end)}</strong>
          <p>Interval {f.low.toFixed(PAIR_META[s.pair].decimals)}–{f.high.toFixed(PAIR_META[s.pair].decimals)}. Original record preserved.</p>
          {m >= f.end ? <p>Observed at horizon: {barAt(s.pair, s.story, f.end).close.toFixed(PAIR_META[s.pair].decimals)} ·
            {barAt(s.pair, s.story, f.end).close >= f.low && barAt(s.pair, s.story, f.end).close <= f.high ? ' inside' : ' outside'} this sample interval. One example is not an accuracy estimate.</p> : <p>Outcome not yet known.</p>}
        </div>)}
      </>}
    </>}
    {chapter === 'Plan' && <>
      <p>Sample USD account: {money(EQUITY)} · long-only stop-entry demonstration.</p>
      <div className="iv-form">{(['entry', 'stop', 'target', 'riskPct', 'spread', 'slippage'] as const).map(key =>
        <label key={key}>{({ entry: 'Entry', stop: 'Stop', target: 'Target', riskPct: 'Risk %', spread: 'Round-trip spread (pips)', slippage: 'Slippage each side (pips)' })[key]}
          <input aria-label={key} disabled={frozen} type="number" step={['entry', 'stop', 'target'].includes(key) ? PAIR_META[s.pair].pip : .1}
            value={Number.isFinite(d[key]) ? d[key] : ''} onChange={e => edit(key, e.target.value)} /></label>)}</div>
      <p className="iv-metric"><span>Base currency units</span><strong>{size.units.toLocaleString()}</strong></p>
      <p className="iv-metric"><span>Risk budget</span><strong>{money(size.riskUsd)}</strong></p>
      <p className="iv-metric"><span>Estimated round-trip friction</span><strong>{money(size.costUsd)}</strong></p>
      <p className="iv-metric"><span>Reward / risk after costs</span><strong>{size.rewardRisk.toFixed(2)}R</strong></p>
      <p className="iv-muted">USD conversion uses the sample pair price for USD/JPY and USD/CAD. No commissions, financing or live liquidity model.</p>
      {reasons.map(x => <p className="iv-warning" key={x}>⛔ {x}</p>)}
      <div className="iv-toolbar">
        <button disabled={frozen || !size.valid} onClick={() => dispatch({ type: 'freeze' })}>Freeze plan</button>
        <button disabled={replay || !plan || plan.submittedAt !== undefined} onClick={() => dispatch({ type: 'submit' })}>Submit paper condition</button>
      </div>
      <p>{plan ? `Frozen ${stamp(plan.frozenAt)} · ${plan.id} · ${plan.evidence.length} evidence links.` : 'Accept evidence in Prepare, then freeze the plan. Drafts can be edited on the chart.'}</p>
      {plan?.blockedAt !== undefined && <p className="iv-warning">Blocked: {plan.reason}</p>}
      {plan?.submittedAt !== undefined && plan.blockedAt === undefined && <p>{plan.fill ? 'Simulated fill recorded.' : 'Waiting for a subsequent bar to reach entry.'}</p>}
    </>}
    {chapter === 'Monitor' && <>
      <p className="iv-status">{thesis(s)}</p><p>{r.structure} · feed {r.quality}</p><p>{r.explanation}</p>
      <button disabled={replay || s.alerts.some(a => a.pair === s.pair && a.armedAt <= m)} onClick={() => dispatch({ type: 'arm' })}>Arm close-above-trigger alert</button>
      {s.alerts.filter(a => a.armedAt <= m).map(a => <p key={a.pair}>{a.pair} · frozen threshold {a.threshold}: {a.firedAt !== undefined && a.firedAt <= m ? `Fired ${stamp(a.firedAt)}` : `Armed ${stamp(a.armedAt)}; waiting for subsequent M1 close`}</p>)}
      {reasons.map(x => <p className="iv-warning" key={x}>⛔ {x}</p>)}
      <p className="iv-muted">Alerts report conditions independently of execution permission. A fired alert can coexist with a blocked order.</p>
    </>}
    {chapter === 'Review' && <>
      {!plans.length && <p>No plan recorded at this time. Use the guided story or freeze one in Plan.</p>}
      {plans.map(p => <article className="iv-evidence" key={p.id}>
        <strong>{p.pair} · {p.id}</strong>
        <button onClick={() => { dispatch({ type: 'pair', pair: p.pair }); dispatch({ type: 'seek', minute: p.frozenAt }); focus('trigger'); }}>Inspect frozen decision</button>
        <p>Analysis: {p.evidence.includes('support') && p.evidence.includes('trigger') ? 'Support and trigger evidence recorded' : 'Incomplete evidence record'}.</p>
        <p>Decision: {p.blockedAt !== undefined ? `Entry blocked — ${p.reason}` : p.fill ? 'Paper condition met; admission gates passed at fill' : 'No fill known yet'}.</p>
        <p>Process: invalidation and costs frozen before submission; {p.evidence.length} evidence link(s). {p.exit?.reason === 'Stop' ? 'Invalidation respected.' : ''}</p>
        <p>Outcome: {p.exit ? `${p.exit.reason} · ${money(p.exit.pnl)} net · ${p.exit.r.toFixed(2)}R` : p.fill ? 'Open simulated position; final outcome unknown' : 'No executed trade'}.</p>
        {p.blockedAt !== undefined && <p className="iv-muted">Hypothetical observation only: price moved {((barAt(p.pair, s.story, m).close - barAt(p.pair, s.story, p.blockedAt).close) / PAIR_META[p.pair].pip).toFixed(1)} pips since the block. This is not a fill or a performance result.</p>}
      </article>)}
    </>}
    {chapter === 'Portfolio' && <>
      <p>Sample constraints: 1% combined open risk; $40,000 equivalent net exposure per currency.</p>
      <p className="iv-metric"><span>Realized simulated P&amp;L</span><strong>{money(plans.reduce((sum, p) => sum + (p.exit?.pnl ?? 0), 0))}</strong></p>
      <p className="iv-metric"><span>Open planned risk</span><strong>{money(plans.reduce((sum, p) => sum + (p.fill && !p.exit ? p.riskUsd : 0), 0))}</strong></p>
      {Object.entries(exposure(s, m)).map(([ccy, value]) => <p className="iv-metric" key={ccy}><span>{ccy} {value >= 0 ? 'long' : 'short'} · USD equivalent</span><strong>{money(value)}</strong></p>)}
      {!plans.some(p => p.fill && !p.exit) && <p>No open simulated positions at this time.</p>}
      <p className="iv-muted">Freeze a second pair’s plan to inspect its marginal exposure. The same limits are checked again at fill. Net exposure is a simplified proxy, not a correlation model.</p>
    </>}
    {chapter === 'Research' && <>
      <p className="iv-warning">Scripted research demonstration · no jobs, authorizations or promotions are sent to a backend.</p>
      {researchAt(m).length === 0 && <p>No research events known yet. Advance to the research chapter checkpoints after {stamp(85)}.</p>}
      {researchAt(m).map(x => <article className="iv-evidence" key={x.minute}><strong>{stamp(x.minute)} · {x.title}</strong><p>{x.detail}</p></article>)}
      <p>Holdout consultations: 0 · live execution: disconnected · simulated results never establish validation.</p>
    </>}
    {chapter === 'Ops' && <>
      <p className="iv-status">Feed: {r.quality} · broker: disconnected</p>
      <p>{hazardOn(s, 'feed', m) ? 'New entries and current prediction withheld. Existing protective stops remain active in the simulated execution tape.' : 'Synthetic tape available. No external connection is needed.'}</p>
      {(['news', 'feed', 'exposure'] as const).map(kind => <div className="iv-evidence" key={kind}>
        <strong>{kind}: {hazardOn(s, kind, m) ? 'ACTIVE' : 'clear'}</strong>
        <button disabled={replay} onClick={() => dispatch({ type: 'hazard', kind })}>Toggle injected {kind} condition</button>
      </div>)}
      <p className="iv-muted">Clearing an injected condition does not override a scheduled blackout or reopen an already rejected order. Reset the story for a new attempt.</p>
      <h3>Capability status</h3><p>Interactive frontend: chart, sizing, replay, journal. Scripted simulation: intelligence, forecast, research and feed health. Backend execution, measured calibration and live trading: not connected.</p>
    </>}
  </section>;
}
