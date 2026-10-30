/** F17 — Portfolio Command (?window=portfolio). READ-ONLY / observe (D6). No control allocates, trades, lifts a
 *  limit or overrides a veto. Every state = glyph + text (+ border shape). Mock data labelled sample. */
import { useEffect, useMemo, useState } from "react";
import { getIntelligenceSource } from "@/intel/factory";
import { SAMPLE_NOW } from "@/intel/fixtures";
import type { PortfolioCommandSnapshot } from "@/intel/portfolioContracts";
import { CATEGORY_META } from "@/desk/journal/ledger";
import { BAND_LABEL, CELL_META, STAGE_META, drillDecisions, journalHref, signed, viewPortfolio, type Selection } from "./portfolio";
import "@/styles/portfolio.css";

type Load = { s: "loading" } | { s: "error" } | { s: "ready"; snap: PortfolioCommandSnapshot; kind: string };
const fmt = (t: number) => new Date(t * 1000).toISOString().slice(0, 16).replace("T", " ") + "Z";
const pct = (w: number) => `${Math.round(w * 1000) / 10}%`;
const same = (a: Selection | null, b: Selection) => !!a && JSON.stringify(a) === JSON.stringify(b);

export function PortfolioRoot({ asOf = SAMPLE_NOW }: { asOf?: number }) {
  const [load, setLoad] = useState<Load>({ s: "loading" });
  const [sel, setSel] = useState<Selection | null>(null);

  useEffect(() => {
    let live = true;
    getIntelligenceSource().getPortfolioCommand()
      .then((r) => { if (live) setLoad({ s: "ready", snap: r.data, kind: r.provenance.kind }); })
      .catch(() => { if (live) setLoad({ s: "error" }); });
    return () => { live = false; };
  }, []);

  const v = useMemo(() => (load.s === "ready" ? viewPortfolio(load.snap, asOf) : null), [load, asOf]);
  const drill = useMemo(() => (load.s === "ready" && sel ? drillDecisions(load.snap, asOf, sel) : []), [load, asOf, sel]);
  const toggle = (next: Selection) => setSel(same(sel, next) ? null : next);
  const selLabel = !sel ? "" : sel.kind === "position" ? `position ${sel.id}` : sel.kind === "cell" ? `${sel.strategy} on ${sel.instrument}` : `strategy ${sel.id}`;

  return (
    <main className="pc-root" aria-label="Portfolio Command">
      <header className="pc-head">
        <strong>Portfolio Command</strong>
        <span className="dk-sample">{load.s === "ready" && load.kind !== "sample" ? load.kind : "sample"}</span>
        <span className="dk-muted">Observe-only (shadow, D6) — no order, allocation, limit or veto can be changed here.</span>
      </header>
      {load.s === "loading" && <p role="status">Loading portfolio…</p>}
      {load.s === "error" && <p role="alert">Portfolio could not be loaded.</p>}
      {v && (
        <div className="pc-grid">
          <section className="pc-col pc-wide" aria-label="Portfolio alerts">
            <h3>Safety alerts <span className="pc-muted">(always shown)</span></h3>
            {v.alerts.length === 0 && <p className="dk-muted">● No active safety alerts at this time.</p>}
            <ul className="pc-list">
              {v.alerts.map((a) => <li key={a.id} className="pc-item pc-alert" role="alert" data-kind={a.kind}>⛔ {a.text}</li>)}
            </ul>
          </section>

          <section className="pc-col" aria-label="Allocation">
            <h3>Allocation <span className="pc-muted">(target weights; shadow)</span></h3>
            {v.strategies.length === 0 && <p className="dk-muted">No strategies known at this time.</p>}
            <ul className="pc-list">
              {v.strategies.map((r) => (
                <li key={r.id} className="pc-item" data-inactive={r.inactive}>
                  <span>{r.id} — {r.weight === null ? "no allocation on record" : `${pct(r.weight)} weight · risk budget ${r.riskBudgetPct}%`}</span>
                  {r.inactive && <span className="pc-muted">◌ inactive ({STAGE_META[r.stage].label.toLowerCase()}) — not counted in the total</span>}
                </li>
              ))}
            </ul>
            <p className="pc-muted">Active total: {pct(v.allocTotal)}{v.allocTotal > 1 ? " ⚠ over 100%" : ""}</p>
          </section>

          <section className="pc-col" aria-label="Currency exposure">
            <h3>Combined currency exposure</h3>
            {!v.exposure && <p className="dk-muted">No portfolio snapshot known at this time.</p>}
            {v.exposure && <p className="pc-muted">Gross open risk {v.grossRiskPct}% · snapshot {fmt(v.exposure.asOf)} · cap {v.limits.exposureCap}</p>}
            <ul className="pc-list">
              {v.currencies.map((c) => (
                <li key={c.ccy} className="pc-item" data-band={c.band}>
                  <span>{c.ccy} {signed(c.value)} ({c.side})</span>
                  <meter min={0} max={v.limits.exposureCap} value={Math.min(Math.abs(c.value), v.limits.exposureCap)} aria-label={`${c.ccy} exposure versus cap`} />
                  <span>{BAND_LABEL[c.band]}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="pc-col" aria-label="Portfolio risk">
            <h3>Drawdown &amp; risk</h3>
            {!v.exposure && <p className="dk-muted">No portfolio snapshot known at this time.</p>}
            {v.drawdown && (
              <div className="pc-item" data-band={v.drawdown.band}>
                <span>Drawdown {v.drawdown.value}% of {v.limits.maxDrawdownPct}% max</span>
                <meter min={0} max={v.limits.maxDrawdownPct} value={Math.min(v.drawdown.value, v.limits.maxDrawdownPct)} aria-label="Portfolio drawdown versus limit" />
                <span>{BAND_LABEL[v.drawdown.band]}</span>
              </div>
            )}
            {v.exposure && <p className="pc-muted">Tail risk {v.exposure.tailRisk} (sample units) · correlation: {v.exposure.correlationState}</p>}
            {v.exposure && v.exposure.constraints.length > 0 && <p className="pc-muted">Constraints: {v.exposure.constraints.join("; ")}</p>}
            <h4>Marginal risk contribution</h4>
            <ul className="pc-list">
              {v.marginal.length === 0 && <li className="dk-muted">None on record.</li>}
              {v.marginal.map((m) => <li key={m.strategy} className="pc-item">{m.strategy}: {m.value} ({Math.round(m.share * 100)}% of total)</li>)}
            </ul>
          </section>

          <section className="pc-col" aria-label="Open positions">
            <h3>Open positions ({v.positions.length})</h3>
            <ul className="pc-list">
              {v.positions.length === 0 && <li className="dk-muted">No open positions at this time.</li>}
              {v.positions.map((r) => (
                <li key={r.id}>
                  {r.position ? (
                    <button type="button" className="pc-row" aria-current={same(sel, { kind: "position", id: r.id }) ? "true" : undefined}
                      onClick={() => toggle({ kind: "position", id: r.id })}>
                      <span>● {r.position.strategy_id} · {r.ccy} {r.position.direction}</span>
                      <span className="pc-muted">risk {r.position.riskPct}% · opened {fmt(r.position.opened_at)}{r.closed ? " · closed ◌" : ""}</span>
                    </button>
                  ) : <span className="pc-item dk-muted">◌ {r.id} — no record known at this time</span>}
                </li>
              ))}
            </ul>
          </section>

          <section className="pc-col pc-wide" aria-label="Eligibility matrix">
            <h3>Eligibility matrix <span className="pc-muted">(strategy × instrument; shadow only)</span></h3>
            <div className="pc-scroll">
              <table className="pc-table">
                <thead><tr><th scope="col">Strategy (tier)</th>{v.matrix.instruments.map((i) => <th key={i} scope="col">{i}</th>)}</tr></thead>
                <tbody>
                  {v.matrix.rows.length === 0 && <tr><td colSpan={v.matrix.instruments.length + 1} className="dk-muted">No eligibility decisions known at this time.</td></tr>}
                  {v.matrix.rows.map((r) => (
                    <tr key={r.strategy}>
                      <th scope="row">{r.strategy} <span className="pc-muted">({r.tier ?? "tier unknown"})</span></th>
                      {r.cells.map((c) => (
                        <td key={c.instrument}>
                          <button type="button" className="pc-cell" data-state={c.state} title={c.reason}
                            aria-label={`${r.strategy} on ${c.instrument}: ${CELL_META[c.state].label}`}
                            aria-current={same(sel, { kind: "cell", strategy: r.strategy, instrument: c.instrument }) ? "true" : undefined}
                            onClick={() => toggle({ kind: "cell", strategy: r.strategy, instrument: c.instrument })}>
                            {CELL_META[c.state].glyph} {CELL_META[c.state].label}
                          </button>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="pc-col pc-wide" aria-label="Strategy lifecycle">
            <h3>Strategy lifecycle <span className="pc-muted">(live execution deferred, D6)</span></h3>
            <ul className="pc-list">
              {v.strategies.length === 0 && <li className="dk-muted">No strategies known at this time.</li>}
              {v.strategies.map((r) => (
                <li key={r.id}>
                  <button type="button" className="pc-row" data-stage={r.stage} aria-current={same(sel, { kind: "strategy", id: r.id }) ? "true" : undefined}
                    onClick={() => toggle({ kind: "strategy", id: r.id })}>
                    <span>{STAGE_META[r.stage].glyph} {r.id} — {STAGE_META[r.stage].label} since {fmt(r.since)}</span>
                    <span className="pc-muted">{r.history.map((h) => STAGE_META[h.stage].label).join(" → ")}{r.note ? ` · ${r.note}` : ""}</span>
                    {r.flag && <span className="pc-warn">⚠ {r.flag}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className="pc-col pc-wide" aria-label="Underlying decisions">
            <h3>Underlying decisions{sel ? ` — ${selLabel}` : ""}</h3>
            {!sel && <p className="dk-muted">Select a position, matrix cell or strategy to see the decisions behind it.</p>}
            {sel && drill.length === 0 && <p className="dk-muted">No decisions known at this time for {selLabel}.</p>}
            <ul className="pc-list">
              {drill.map((t) => (
                <li key={t.trade_id} className="pc-item" data-category={t.category}>
                  <span>{CATEGORY_META[t.category].glyph} {CATEGORY_META[t.category].label} · {t.strategy_id} · {t.instrument} {t.direction} · {fmt(t.entry_time)}{t.closed ? ` · ${t.R ?? "n/a"}R` : " · outcome not yet known"}</span>
                  <span className="pc-muted">{t.decision_trace.map((d) => `${d.step}: ${d.rule}`).join(" → ") || "no decision steps recorded"}</span>
                  <a href={journalHref(t.trade_id)} target="_blank" rel="noreferrer" aria-label={`Open ${t.trade_id} in the trade journal`}>journal ↗</a>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </main>
  );
}