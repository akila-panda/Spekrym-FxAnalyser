# Spekrym-FX RELAY — Design (cross-asset / information-flow research)

**Companion to** `RELAY_PHASES.md`. Date: 2026-10-12. Working name "RELAY" (rename freely).
Third module beside **Scan** (strategy lab) and **Desk** (discretionary analysis cockpit).

---

## 0. Thesis & honest premise
The project's own research found **no cost-surviving edge in EUR/USD single-series intraday price**
(scalping, ORB, momentum, Asian-range, liquidity-reaction). The dossier flags the highest-EV lane as
**different information**: does information in *other* instruments — rates, risk, commodities, the dollar
complex, other FX — lead a target pair *before* it is priced in?

RELAY tests that question with the **same falsification discipline as the Judge**: pre-registration,
TRAIN/VALID/VAULT, walk-forward, expectancy-net-of-cost (bid/ask), and — because the search space is huge —
**aggressive multiple-testing control**. The honest win condition is *"a handful of relationships survive
cost + out-of-sample + FDR, or we conclude none did."* RELAY is a microscope, not a money printer.

**Non-negotiables:** no look-ahead (causal-windowed features only); costs always in the loop; the number of
variants tried is tracked and shown next to every result; nothing enters the vault except a final confirmation.

## 1. What RELAY studies (four families)
1. **Lead-lag prediction.** Does driver X at lag *k* predict target pair Y, out-of-sample, net of cost?
   (lagged correlation, sign-hit-rate, mutual-information / Granger-style tests.)
2. **Cross-asset conditioning.** Does a driver (e.g. 2Y-yield change, gold return, a risk proxy from indices)
   improve a signal on Y only in certain **regimes** (risk-on/off, vol regime, session)?
3. **Cross-sectional / relative-value.** Rank the FX majors by a signal built from the **dollar complex**
   (a basket of the actual USD pairs — *not* a synthetic DXY, per prior decision), carry, and cross-sectional
   momentum; trade the spread between strong and weak.
4. **Information-flow mapping.** A directed, honest map of *which* assets lead *which* pairs, by how much,
   in which regime — the research output, not a trade signal.

## 2. Data substrate (OANDA-native only)
- **FX majors** (done/underway): EUR, GBP, JPY, CHF — and AUD, CAD, NZD to finish.
- **Macro influencers** (to download in R0): metals `XAU/XAG`, energy `BCO/WTI`, rates `USB10Y/USB02Y`,
  indices `SPX500/US30/NAS100/DE30/UK100/JP225`. No synthetic DXY, no futures (locked decisions).
- **Aligned panel:** time-aligned returns for every instrument at each TF, UTC, **session-tagged**, QA'd,
  with a documented **dollar-strength index built from the real majors**. Missing data = absence, never zero.

## 3. Cockpit UX (frontend surface, reuses Scan/Desk infrastructure)
App-level switch **Scan | Desk | Relay** (extends `window/role` + the mode/command infra). Dark "analyst
desk" theme, existing tokens, no new colours. Five views:

1. **Relationship matrix** — a heatmap *driver × target* of out-of-sample predictive strength at the best
   lag; cells marked **FDR-survived / not**; click a cell → the explorer. Honest colour: effect size, with a
   hard "survived multiple-testing?" badge separate from the colour.
2. **Lead-lag explorer** — overlay a driver and a target shifted by lag *k* (reuse the chart/stack), with the
   OOS stat, CI, hit-rate, and **"variants tried: N"** always visible. Scrub *k* to see the relationship move.
3. **Regime lens** — toggle regime conditioning (risk-on/off, vol, session); see how a relationship changes;
   relationships that exist *only* unconditionally are flagged as suspect.
4. **Cross-sectional dashboard** — the dollar-strength index, carry and momentum ranks across the majors,
   and the long-strong/short-weak spread with cost-adjusted expectancy.
5. **Result ledger** — every pre-registered hypothesis, its PASS / FAIL / INCONCLUSIVE verdict, the variant
   count, the data snapshot (`dataVersion`), and vault status. The honest scoreboard.

## 4. Honesty surface (the module's whole point)
- **Multiple-testing is shown, never hidden.** Every result carries "tested N variants" and whether it
  survived Benjamini-Hochberg FDR / deflation across the search space it belongs to.
- **Exploratory vs confirmed** is explicit: nothing is "confirmed" until it passes OOS + FDR + the cost model
  and is recorded in the ledger; the **vault** holds the final hold-out, opened once.
- **Costs always on.** Per-instrument spread; a basket's cost is the sum — shown, not buried.
- **No prediction language in copy.** "USB02Y led EUR/USD by ~15 min in risk-off, OOS hit-rate 0.56 ±0.04,
  survived FDR" — never "EUR/USD will rise."
- **Lineage.** `explain(result)` walks driver → lag → regime → feature → data snapshot.

## 5. Relationship to the other modules
- **Reuses the Judge** (partition/vault/ledger, walk-forward, FDR, deflated significance, bid/ask backtest) —
  does **not** rebuild it; RELAY adds cross-asset feature construction + the relationship/matrix layer on top.
- **Feeds Scan.** A surviving cross-asset signal becomes a candidate strategy the Scan lab can run.
- **Independent of Desk.** Desk is discretionary markup; RELAY is systematic cross-asset search. Different jobs.

## 6. What RELAY is NOT
Not a live trading system, not an alerting service, not a macro-news reader, not a place for single-series
price patterns (that's Scan/Desk). It does not promise an edge; it promises an honest search for one in the
space most likely to contain it.
