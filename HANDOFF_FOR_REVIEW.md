# HANDOFF_FOR_REVIEW.md

You are reviewing the **Spekrym-FX Analyser** edge + strategy modules. Read this
before proposing anything. The owner wants a *falsifying* second opinion, not
encouragement. If you end up recommending "tune the strategy," you must first
defeat the two tests in Section 3 — otherwise your recommendation is invalid.

---

## 1. The exact question

> "The main levers are the Edge Module and the Strategy Module. If we improve
> those two and re-test, will the system be profitable on EUR/USD?"

The current answer from the codebase is **NO** — not by improving those two
modules, because the failure is in the *information* they consume, not in the
modules themselves. Your job: try to overturn that with evidence, or confirm it.

## 2. What was already built and tested (don't rebuild it)

Three independent edge/strategy stacks, all backtested on real data, all
net-negative after realistic cost:

| Stack | Edge (signal) | Strategy (trade) | Result |
|---|---|---|---|
| A. ML forecast | HistGradientBoosting, 19 features, 3-class, H1 (`forecast/`) | trade class if conf ≥ 0.45 (`backtest/strategies/forecast_signal.py`) | no edge after cost |
| B. Agent coordinator | 3 weighted trees (tech .60/fund .25/sent .15) over forecast+SMC (`agents/coordinator.py`) | risk gates + confidence-scaled sizing, RR 2.0 (`backtest/strategies/coordinator_signal.py`) | no lift over A |
| C. M1 scalper | HTF trend → M15 P/D → M5 FVG/liquidity → M1 trigger (`market_context/scalp_strategy.py`) | 5-pip TP / 4-pip SL, 0.01 lot, bid/ask fills (`backtest/scalp_engine.py`) | **NO-GO**, see `SCALP_FINDINGS.md` |

Measured EUR/USD OANDA spread = **1.6 pips** median (London/NY), not the
optimistic 0.6 some earlier tests assumed. A 5-pip target gives up 32% to spread.

## 3. The two tests you MUST run and defeat before recommending changes

These are the falsification tests. They test the *information*, independent of any
strategy. If they hold, no edge/strategy improvement can produce profit.

### 3a. MAE/MFE (the decisive one)
```
python -m research.scalp_validate EUR_USD 200000
```
Prior result: **MFE p50 = 0.5 pips, MAE p50 = 4.1 pips.** Interpretation: after a
signal fires, the median trade's best favorable excursion is half a pip while it
runs ~4 pips against. This is the entry's *raw predictive content* — TP/SL choice
cannot manufacture favorable movement that the price series does not contain.
**If you propose better entries/exits, you must first show MFE p50 materially > 0
for your entries. Otherwise the proposal is dead on arrival.**

### 3b. Level-to-level (fair-odds) test
```
python -m research.edge_level_to_level EUR_USD H1
```
Prior result: hit-rate of the target-before-stop ≈ the fair rate implied by
risk/(risk+reward) — i.e. entries are indistinguishable from a random walk. Any
claimed edge must beat this fair rate out-of-sample, per fold, net of 1.6 pips.

### Supporting reproductions
```
python -m research.spread_profile EUR_USD        # confirm the 1.6-pip spread
python -m research.walkforward_eurusd            # H1 forecast P&L walk-forward
python -m backtest.run_scalp EUR_USD 200000      # scalper end-to-end
```

## 4. Bar-by-bar trade flow (Stack C — the active scalper)

```
per M1 bar:
 1. session gate         07:00–16:00 & 12:00–21:00 UTC else skip
 2. manage open pos       SL(bid_l/ask_h) before TP(bid_h/ask_l); 45-min time stop; flat at session end
 3. HTF context (hourly)  H1&H4 trend→bias; M15 premium/discount; M5 FVG+liquidity→zones; atr_m5
 4. strategy (all pass)   bias set → location ok (discount/eq for long) → price in/near a zone → M1 trigger
 5. spread gate           (ask_c−bid_c)/pip ≤ 1.5 else skip
 6. fill (next open)       long buy ask_o[k+1]; short sell bid_o[k+1]; TP +5 / SL −4 pip
 7. exit                   SL-before-TP (pessimistic), time stop, or session-end flat; P&L→USD
```
Default config (`scalp_strategy.DEFAULT_CFG`): tp 5 / sl 4 / zone_atr 0.6 /
disp_mult 1.3 / trigger "either". Engine gates in `scalp_engine.run_scalp_backtest`.

Stacks A/B instead run on `backtest/engine.py` (mid-price + ATR/SMC stops): 260-bar
warmup → 19 features → model proba → (coordinator: trees → weighted net → risk
gates → confidence sizing) → SMC-order-block reference stop → RR 2.0.

## 5. Rules of engagement for your review

- **Out-of-sample only.** Walk-forward, per-fold. A single in-sample curve proves nothing.
- **Net of 1.6-pip spread.** In-sample or zero-cost results are rejected.
- **No curve-fitting.** Adding parameters until the backtest turns green is the failure mode we are explicitly guarding against. Report parameter count and degrees of freedom.
- **State your prior.** Random-walk expectancy at level-to-level = 0. Beat it with statistical significance (bootstrap CI excluding 0, folds+ ≥ 75%) or report no edge.
- **Where the owner and I think a real edge *could* live** (different information, not better modules on the same price): cross-sectional carry/momentum across many pairs, cointegration/relative-value pairs trading, or non-price data (rates, positioning, flow, crypto funding/basis). If you agree EUR/USD single-series price is exhausted, say so plainly and point at one of these.

## 6. What's in this archive
`forecast/`, `agents/`, `backtest/strategies/` + `scalp_engine.py` + `engine.py`,
`market_context/`, `ta_engine/` detectors, `risk/`, `research/` validation scripts,
plus `SCALP_FINDINGS.md`, `SYSTEM_STRATEGY_AND_EDGE.md`, `SCALP_PHASE_C_STRATEGY.md`.
Data itself (candles) is in TimescaleDB, not in this zip; `ta_engine/loader.py`
shows the schema and how frames are loaded.
