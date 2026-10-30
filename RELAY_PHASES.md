# Spekrym-FX RELAY — Build Phases & Contracts

**Companion to** `RELAY_DESIGN.md`. Date: 2026-10-12. Working name "RELAY" (rename freely).
**Two tracks:** **R** = research engine (Python, extends the Judge) · **C** = cockpit (frontend, reuses
Scan/Desk infra). One phase per session; finish → verify → report → STOP (WAIT).

**Definition of done (R phases):** new logic has tests · **every feature is causal-windowed, no look-ahead** ·
costs in the loop · multiple-testing tracked · pre-registered before any VAULT touch · `pytest` green.
**(C phases):** `npm run typecheck` + `npm test` + `npm run build` green · 0 new console errors · no new
colours · reuses the annotation/chart/stack path · Scan/Desk untouched.

**Reuse, don't rebuild:** the Judge — `engine/{partition,runner,judge,ledger,datacache}`,
`backtest/scalp_engine` (bid/ask + slippage), walk-forward, Benjamini-Hochberg FDR, deflated significance,
TRAIN(60)/VALID(20)/VAULT(20) with the locked vault. RELAY adds cross-asset features + the relationship/matrix
layer on top. **Do not** touch `scan/`, `components/setups/`, `sync/`, Desk stores.

---

## A. Contracts (build in R1; everything depends on them)

**AlignedPanel:** per TF, a UTC-indexed, session-tagged table of returns for every instrument, from closed
bars only; `dataVersion = hash(content + instruments + tf + calendar version)` (range excluded). Missing =
absence, never a synthetic zero bar.

**Relationship object:**
```
Relationship = { id, driver, target, tf, lag, regime|null,
  stat{kind: lagged_corr|sign_hit|mutual_info|granger, value, ci_low, ci_high, n},
  oos{split: train|valid|vault, value, n}, cost_adjusted: bool,
  search_space_id, variants_in_space, fdr_survived: bool, deflated_p,
  known_at_rule, dataVersion, algorithmVersion, parameterHash, status: exploratory|PASS|FAIL|INCONCLUSIVE }
```
- **id** derived from `driver:target:tf:lag:regime` (+ versions), never from the measured value.
- **Causal windowing:** every feature uses only data with `known_at <= t` (expanding / rolling /
  session-conditioned normalization allowed; full-history normalization forbidden).
- **Multiple-testing is identity, not decoration:** a result belongs to a declared `search_space`
  (driver×target×lag×regime grid); FDR + deflated significance are computed **across that whole space**, and
  `variants_in_space` is stored and shown. A relationship found by scanning 5,000 combos is held to a 5,000-wide bar.

**Verdict rule (reuse the Judge's):** PASS only if it beats the cost model, survives OOS on VALID, survives
FDR across its space, and the single final check on VAULT confirms it. Otherwise FAIL / INCONCLUSIVE. The
vault is opened once and logged.

---

## B. Research track (Python)

- **R0 — Data completion + aligned panel.** Finish the macro-influencer backfill (metals/energy/rates/indices,
  all TFs, bid/ask, QA'd, one instrument at a time) and the remaining FX majors (AUD/CAD/NZD). Build
  `AlignedPanel` + the **dollar-strength index from the real majors** (documented construction). Tests: panel
  alignment across DST/weekends, QA gates, `dataVersion` stability.
- **R1 — Cross-asset feature library (causal).** Returns at horizons, lagged driver features, rate
  differentials, a **risk proxy** from indices, carry, cross-sectional ranks — all causal-windowed. Tests:
  no-lookahead property on every feature; weekend-straddle; parameter hashing.
- **R2 — Lead-lag relationship engine.** For each `(driver, target, lag, regime)` compute the `stat` with a
  CI and an OOS split; emit `Relationship` objects. Tests: known synthetic lead-lag recovered; shuffled
  control shows none; CI coverage.
- **R3 — Multiple-testing control (keystone).** Declare the search space up front; apply Benjamini-Hochberg
  FDR + deflated significance across it; **pre-register in the ledger before running**; store/show
  `variants_in_space`. Tests: a pure-noise panel yields ~0 FDR-survivors; the count matches the grid.
- **R4 — Signal → strategy bridge.** Turn a surviving relationship into a tradeable rule and test
  expectancy-net-of-cost via `scalp_engine` (bid/ask), walk-forward, then the vault. Reuses the Judge
  end-to-end. Tests: a planted signal passes; a cost-killed one FAILs; vault counted once.
- **R5 — Regime conditioning.** Risk-on/off (from indices), vol regime, session; conditional relationship
  tests; flag relationships that exist only unconditionally. Tests: regime labels causal; conditional vs
  unconditional separation on fixtures.
- **R6 — Cross-sectional / relative-value.** Dollar-complex strength, carry + cross-sectional momentum ranks,
  long-strong/short-weak spread with per-instrument cost + capacity note. Tests: rank stability, cost
  aggregation, OOS.
- **R7 — Lineage + result ledger.** `explain(result)` walks driver→lag→regime→feature→snapshot; append-only
  ledger with pre-registration sha, verdicts, variant counts, vault status. Tests: lineage resolves; ledger
  append-only; verdict reproducibility.

## C. Cockpit track (frontend)

- **C0 — Relay shell.** App-level `Scan | Desk | Relay` switch (extend `window/role` + command/mode infra),
  `relay/` module, `styles` reuse, URL `?app=relay`. Reads results from a mock/`relay` data source (same
  `Sourced<T>` sample-labelling pattern as Desk). Tests: switch keeps pair/tz; Scan/Desk untouched.
- **C1 — Relationship matrix.** Driver×target heatmap at best lag; FDR-survived badge separate from colour;
  cell → explorer. Tests: cell mapping; badge reflects `fdr_survived`.
- **C2 — Lead-lag explorer.** Overlay driver vs target shifted by lag *k* (reuse chart/stack), OOS stat + CI +
  hit-rate + **"variants tried: N"** always visible; scrub *k*. Tests: lag shift correctness; honesty labels present.
- **C3 — Regime lens.** Toggle regime; show how the relationship changes; suspect flag. Tests: lens filters.
- **C4 — Cross-sectional dashboard.** Dollar-strength index, carry/momentum ranks, spread + cost-adjusted
  expectancy. Tests: rank render; cost caveat present.
- **C5 — Result ledger view.** Pre-registered hypotheses, verdicts, variant counts, `dataVersion`, vault
  status. Tests: ledger rows; exploratory-vs-confirmed labelling.

---

## D. Dependencies, sequencing, honesty gates
- **Critical path:** R0 → R1 → R2 → **R3 (FDR)** → R4. C0 can start once any results exist; C1/C2 after R2;
  C5 after R7. R5/R6 parallel after R2.
- **Gate H1 (after R3):** before trusting *any* matrix cell, confirm on a **pure-noise panel the module
  reports ~zero FDR-survivors**. If it finds "signals" in noise, the pipeline is leaking — stop and fix.
- **Gate H2 (after R4):** a planted synthetic cross-asset signal must PASS end-to-end and a cost-killed one
  must FAIL, before any real relationship is believed.
- **Data gate:** R0 must finish the macro-influencer download; until then RELAY runs on partial data and every
  surface is labelled "partial data — not all drivers present."

## E. Multiple-testing discipline (the one rule that makes RELAY honest)
Cross-asset mining tests thousands of combinations; most "findings" are noise. Therefore: declare the search
space **before** running · pre-register in the ledger · apply BH-FDR + deflated significance across the whole
space · keep the VAULT for a single final confirmation · **always display `variants_in_space` next to the
result**. A relationship is only as credible as the size of the search that produced it.

## F. Open questions (owner; defaults in brackets)
- **RQ-1** instrument set for drivers — the listed macro influencers only, or add crosses (EUR_GBP, EUR_JPY)
  for relative-value? [listed + a few crosses] — R0.
- **RQ-2** detection TFs for lead-lag — M5/M15/H1 first? [M15 + H1, then M5] — R2.
- **RQ-3** max lag horizon to scan (bars) per TF [up to ~24 bars] — R2.
- **RQ-4** regime definitions (risk proxy source, vol lookback) [risk from SPX500/US30 beta; vol = ATR regime] — R5.
- **RQ-5** acceptable FDR level and the deflation convention [BH q=0.1, deflated Sharpe] — R3.
- **RQ-6** is live/real data timing changing (affects R0 scope) [treat current OANDA history as the source] — R0.

## G. Honest risk register
| Risk | Why it bites | Mitigation |
|---|---|---|
| Multiple testing | thousands of combos → false positives look real | R3 FDR/deflation across declared space; gate H1 on noise |
| Look-ahead in features/regimes | normalization or regime labels peeking | causal windowing; no-lookahead property tests; the Judge harness |
| Non-stationarity | relationships decay (same lesson as single-series) | walk-forward; vault; regime conditioning; expect decay, don't overfit |
| Cost/capacity | baskets multiply spread | per-instrument cost summed and shown; capacity note |
| Data gaps/alignment | DST, weekends, session rolls | session-tagged panel; absence not zero; QA gate |
| Pretty cockpit → false confidence | a heatmap *feels* like an edge | FDR badge separate from colour; "variants tried" always on; exploratory vs confirmed |
| Scope vs payoff | big module, edge still unproven | ship R0–R4 + C0–C2 first, judge at gate H2 before going further |
