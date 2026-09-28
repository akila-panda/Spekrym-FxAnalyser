# EXPERIMENT_LOG.md

Every experiment run during the EUR/USD edge forensics, so results can't be
cherry-picked. Dataset unless noted: EUR_USD H1, 15,000 candles, holdout = last
20% (2026-04-01 → 2026-09-23), 260-bar warmup, 1% risk, 2:1 RR.

| # | Hypothesis | Change | OOS window | Result | Decision | Reason |
|---|---|---|---|---|---|---|
| 1 | Forecast strategy is profitable | baseline, 0 cost | holdout | +7.38%, 85 trades, exp +0.094R | keep as reference | matches original claim |
| 2 | Result survives realistic cost | +0.6 spread +0.1 slip | holdout | +4.94%, exp +0.067R | flag | cost roughly halves the edge |
| 3 | Cost is the only run-to-run diff | spread sweep 0→2 pip | holdout | monotone decay; reconciles +7.38 vs +4.94 | accept reconciliation | see RECONCILIATION.md |
| 4 | Edge is statistically real | bootstrap 20k on 85 R | holdout | exp CI [−0.22,+0.38]R, P(≤0)=37% | **reject "proven"** | indistinguishable from 0 |
| 5 | Win rate beats 2:1 break-even | Wilson CI | holdout | 36.5%, CI [27.0,47.1] vs 33.3 | inconclusive | CI spans break-even |
| 6 | Model probability is calibrated | win rate by conf bucket | holdout | monotonic (32%→44%→75%) | **accept (promising)** | real information in prob |
| 7 | Trades are independent | lag-1 autocorr, gap | holdout | autocorr −0.09, effN≈85 | accept | N is genuinely ~85 |
| 8 | Profit is broad-based | session breakdown | holdout | profit only in 10 thin-session trades; liquid sessions −8.1R | **reject** | fragile concentration |
| 9 | Edge is symmetric | direction split | holdout | short +0.23R, long −0.03R | note | short-only |
| 10 | Exits are mis-set | MAE/MFE | holdout | winners low heat, losers don't run our way | no change | no cheap exit win |
| 11 | It's a scalper | holding/frequency | holdout | 0.49 trades/day, 5–11h holds | **reject** | it's a swing system |
| 12 | Coordinator > forecast | earlier all-pairs run | holdout | coordinator overtrades, worse risk-adj | reject coordinator | prior turn evidence |
| 13 | Higher confidence threshold = edge | thr 0.45/0.50/0.55, retrain per fold | **5-fold P&L walk-forward** | expR +0.008/−0.037/−0.151; no CI clears 0 | **reject** | edge worsens with selectivity; calibration was noise |
| 14 | Short-only ≥0.50 = edge | short filter | 5-fold walk-forward | expR +0.019, CI [−0.21,+0.26] | **reject** | coin flip |

## Multiple-testing note
~12 experiments run. The two "promising" positives (calibration, short-bias) are
hypotheses to *test on new data*, not conclusions. No experiment yet establishes
a costed, statistically significant EUR/USD edge. Nothing here should be
implemented as a strategy change without OOS re-validation (see STRATEGY_REDESIGN.md).

## Pending experiments (not yet run)
P&L walk-forward (retrain per fold) · Monte Carlo (trade-order + cost) ·
parameter-neighborhood robustness · session-realistic spreads · regime split ·
news windows · confidence-threshold ≥0.50 re-validation on unseen folds.
