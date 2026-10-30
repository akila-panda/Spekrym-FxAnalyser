/** F10 — Trade-Intelligence panel + journal popout (?window=journal). Reads TradeRecords from the
 *  IntelligenceSource (mock, "sample"). Four categories always listed; categories distinguished by glyph + text;
 *  counterfactuals labelled as hypothetical. Causal at the viewed time. ?trade=<id> deep-links and centres a trade. */
import { useEffect, useMemo, useRef, useState } from "react";
import { getIntelligenceSource } from "@/intel/factory";
import { SAMPLE_NOW } from "@/intel/fixtures";
import type { TradeRecord } from "@/intel/contracts";
import { SAMPLE_REGIME_SERIES } from "@/desk/canvas/context/regimeFixtures";
import { decodeState } from "@/url/urlState";
import {
  CATEGORIES, CATEGORY_META, countByCategory, executedSample, filterByCategory, fmtUtc,
  regimeFor, tradeFocusRange, viewTrades, type Category,
} from "./ledger";
import "@/styles/journal.css";

type Load = { s: "loading" } | { s: "error" } | { s: "ready"; trades: TradeRecord[]; kind: string };

export function JournalRoot({ asOf = SAMPLE_NOW }: { asOf?: number }) {
  const [load, setLoad] = useState<Load>({ s: "loading" });
  const [shown, setShown] = useState<Category[]>([...CATEGORIES]);
  // Read once at first render: the URL mirror rewrites the query afterwards and drops params it does not own.
  const [selected, setSelected] = useState<string | null>(() => {
    try { return decodeState(window.location.search).trade ?? null; } catch { return null; }
  });
  const selRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    let live = true;
    getIntelligenceSource().getTrades("EUR_USD")
      .then((r) => { if (live) setLoad({ s: "ready", trades: r.data, kind: r.provenance.kind }); })
      .catch(() => { if (live) setLoad({ s: "error" }); });
    return () => { live = false; };
  }, []);

  const trades = useMemo(() => (load.s === "ready" ? viewTrades(load.trades, asOf) : []), [load, asOf]);
  const counts = useMemo(() => countByCategory(trades), [trades]);
  const list = useMemo(() => filterByCategory(trades, shown), [trades, shown]);
  const sample = useMemo(() => executedSample(trades), [trades]);
  const sel = trades.find((t) => t.trade_id === selected) ?? null;

  useEffect(() => { selRef.current?.scrollIntoView?.({ block: "center" }); }, [selected, load.s]);

  const toggle = (c: Category) => setShown((s) => (s.includes(c) ? s.filter((x) => x !== c) : [...s, c]));

  return (
    <main className="vj-root" aria-label="Trade journal">
      <header className="vj-head">
        <strong>Trade intelligence</strong>
        <span className="dk-sample">{load.s === "ready" && load.kind !== "sample" ? load.kind : "sample"}</span>
        <div className="vj-cats" role="group" aria-label="Trade categories">
          {counts.map(({ category, count }) => (
            <button key={category} type="button" aria-pressed={shown.includes(category)} onClick={() => toggle(category)}>
              <span aria-hidden="true">{CATEGORY_META[category].glyph}</span> {CATEGORY_META[category].label} ({count})
            </button>
          ))}
        </div>
      </header>
      <p className="dk-muted vj-note">
        Executed sample: n={sample.n}{sample.belowFloor ? " — below the 30-trade floor; no performance claim is made." : "."} Counterfactuals are hypothetical and never counted as results.
      </p>

      {load.s === "loading" && <p role="status">Loading trades…</p>}
      {load.s === "error" && <p role="alert">Trades could not be loaded.</p>}
      {load.s === "ready" && (
        <div className="vj-body">
          <ul className="vj-list" aria-label="Trades">
            {list.length === 0 && <li className="dk-muted">No trades in the selected categories at this time.</li>}
            {list.map((t) => (
              <li key={t.trade_id}>
                <button
                  type="button" className="vj-row" data-cat={t.category}
                  aria-current={t.trade_id === selected ? "true" : undefined}
                  ref={t.trade_id === selected ? selRef : undefined}
                  onClick={() => setSelected(t.trade_id)}
                >
                  <span aria-hidden="true">{CATEGORY_META[t.category].glyph}</span>
                  <span>{CATEGORY_META[t.category].label}</span>
                  <span>{t.direction}</span>
                  <span className="vj-muted">{fmtUtc(t.entry_time)}</span>
                  <span className="vj-muted">{t.closed ? (t.R !== undefined ? `${t.R}R${t.category === "counterfactual" ? " (hypothetical)" : ""}` : "closed") : "open / no outcome yet"}</span>
                </button>
              </li>
            ))}
          </ul>
          <section className="vj-detail" aria-label="Trade detail">
            {!sel ? <p className="dk-muted">Select a trade to see its decision trace.</p> : <Detail t={sel} />}
          </section>
        </div>
      )}
    </main>
  );
}

function Detail({ t }: { t: ReturnType<typeof viewTrades>[number] }) {
  const [from, to] = tradeFocusRange(t);
  const reg = regimeFor(t, SAMPLE_REGIME_SERIES);
  return (
    <div>
      <h4>{CATEGORY_META[t.category].label} · {t.direction} · {t.instrument}</h4>
      <p className="dk-muted">{CATEGORY_META[t.category].note}</p>
      <dl className="vj-dl">
        <dt>Focus window</dt><dd>{fmtUtc(from)} → {fmtUtc(to)}</dd>
        <dt>Entry</dt><dd>{t.entry_price}</dd>
        <dt>Reason codes</dt><dd>{t.entry_reason_codes.join(", ") || "—"}</dd>
        <dt>Regime at entry</dt>
        <dd>{reg.kind === "known" ? `${reg.structure} (${reg.id})` : reg.kind === "none" ? "—" : "not yet known at entry"}</dd>
        <dt>Lineage</dt><dd>data {t.data_version} · cost model {t.cost_model_version}</dd>
      </dl>
      <h5>Decision trace</h5>
      <ol aria-label="Decision trace">
        {t.decision_trace.length === 0 ? <li className="dk-muted">No steps recorded.</li> : t.decision_trace.map((d, i) => (
          <li key={i}>{fmtUtc(d.at)} · {d.step} · {d.rule}</li>
        ))}
      </ol>
    </div>
  );
}