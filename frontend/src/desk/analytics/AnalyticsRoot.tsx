/** F14 — Analytics / Validation ledger board (?window=analytics). READ-ONLY: renders experiments, verdicts,
 *  evidence tiers, "tested N variants" and the VAULT consultation counter from IntelligenceSource.getLedger
 *  (mock, "sample"). No control here can promote, confirm, run, or open the VAULT. Tier = glyph + text. */
import { useEffect, useMemo, useState } from "react";
import { getIntelligenceSource } from "@/intel/factory";
import { SAMPLE_NOW } from "@/intel/fixtures";
import type { EvidenceTier, LedgerSnapshot } from "@/intel/contracts";
import { filterTiers, TIERS, TIER_META, viewLedger } from "./board";
import "@/styles/ledger.css";

type Load = { s: "loading" } | { s: "error" } | { s: "ready"; ledger: LedgerSnapshot; kind: string };
const STATUS_GLYPH = { PASS: "✓", FAIL: "✕", INCONCLUSIVE: "?" } as const;
const fmt = (t: number) => new Date(t * 1000).toISOString().slice(0, 16).replace("T", " ") + "Z";

export function AnalyticsRoot({ asOf = SAMPLE_NOW }: { asOf?: number }) {
  const [load, setLoad] = useState<Load>({ s: "loading" });
  const [shown, setShown] = useState<EvidenceTier[]>([...TIERS]);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    getIntelligenceSource().getLedger()
      .then((r) => { if (live) setLoad({ s: "ready", ledger: r.data, kind: r.provenance.kind }); })
      .catch(() => { if (live) setLoad({ s: "error" }); });
    return () => { live = false; };
  }, []);

  const view = useMemo(() => (load.s === "ready" ? viewLedger(load.ledger, asOf) : null), [load, asOf]);
  const list = useMemo(() => (view ? filterTiers(view.rows, shown) : []), [view, shown]);
  const sel = view?.rows.find((r) => r.record.id === selected) ?? null;
  const toggle = (t: EvidenceTier) => setShown((s) => (s.includes(t) ? s.filter((x) => x !== t) : [...s, t]));

  return (
    <main className="va-root" aria-label="Validation ledger">
      <header className="va-head">
        <strong>Validation ledger</strong>
        <span className="dk-sample">{load.s === "ready" && load.kind !== "sample" ? load.kind : "sample"}</span>
        <span className="dk-muted">Read-only — verdicts come from the Judge; nothing here promotes or opens the VAULT.</span>
      </header>

      {load.s === "loading" && <p role="status">Loading ledger…</p>}
      {load.s === "error" && <p role="alert">Ledger could not be loaded.</p>}
      {view && (
        <>
          <section className="va-summary" aria-label="Multiple-testing and VAULT">
            <strong>{view.label}</strong>
            <span>FDR α {view.fdrAlpha} applied across all tested variants — a single p-value is not a result on its own.</span>
            <span aria-label="VAULT consultations">VAULT consultations: {view.vault.consultations}{view.vault.consultations === 0 ? " (never consulted)" : ""}</span>
          </section>
          <div className="va-tiers" role="group" aria-label="Evidence tiers">
            {view.tierCounts.map(({ tier, count }) => (
              <button key={tier} type="button" aria-pressed={shown.includes(tier)} onClick={() => toggle(tier)}>
                <span aria-hidden="true">{TIER_META[tier].glyph}</span> {TIER_META[tier].label} ({count})
              </button>
            ))}
          </div>
          <div className="va-body">
            <ul className="va-list" aria-label="Experiments">
              {list.length === 0 && <li className="dk-muted">No experiments in the selected tiers at this time.</li>}
              {list.map((r) => (
                <li key={r.record.id}>
                  <button type="button" className="va-row" data-tier={r.tier} aria-current={r.record.id === selected ? "true" : undefined} onClick={() => setSelected(r.record.id)}>
                    <span aria-hidden="true">{TIER_META[r.tier].glyph}</span>
                    <span>{r.record.name}</span>
                    <span>{STATUS_GLYPH[r.record.verdict.status]} {r.record.verdict.status}</span>
                    <span className="va-muted">{TIER_META[r.tier].label}{r.downgrade ? " ⚠ downgraded" : ""}</span>
                    <span className="va-muted">n={r.record.verdict.n_trades}{r.lowSample ? " (low sample)" : ""}</span>
                  </button>
                </li>
              ))}
            </ul>
            <section className="va-detail" aria-label="Experiment detail">
              {!sel ? <p className="dk-muted">Select an experiment to see its verdict.</p> : (
                <div>
                  <h4>{sel.record.name}</h4>
                  <p className="dk-muted">{TIER_META[sel.tier].note}</p>
                  {sel.downgrade && <p className="va-warn" role="note">⚠ Claimed {TIER_META[sel.claimedTier].label}; shown as {TIER_META[sel.tier].label}: {sel.downgrade}.</p>}
                  <dl className="va-dl">
                    <dt>Verdict</dt><dd>{STATUS_GLYPH[sel.record.verdict.status]} {sel.record.verdict.status}</dd>
                    <dt>Trades</dt><dd>{sel.record.verdict.n_trades}{sel.lowSample ? " — below the 30-trade floor; no performance claim." : ""}</dd>
                    <dt>Expectancy</dt><dd>{sel.record.verdict.expectancy_pips} pips (net of cost)</dd>
                    <dt>Win rate</dt><dd>{sel.record.verdict.win_rate}</dd>
                    <dt>p-value</dt><dd>{sel.record.verdict.p_value} (raw; corrected over {view.tested ?? "unknown"} variants)</dd>
                    <dt>Split</dt><dd>{sel.record.verdict.split ?? "—"}</dd>
                    <dt>Lineage</dt><dd>data {sel.record.verdict.data_version ?? "—"} · cost model {sel.record.verdict.cost_model_version ?? "—"}</dd>
                    <dt>Judged</dt><dd>{fmt(sel.record.ts)}</dd>
                  </dl>
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </main>
  );
}