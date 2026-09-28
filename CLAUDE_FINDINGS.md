# CLAUDE_FINDINGS.md

Adversarial forensic assessment of the EUR/USD edge. Mandate: try to **break**
the strategy; report the truth, not a green equity curve. All numbers from
`research/forensics_eurusd.py` on the EUR_USD H1 out-of-sample holdout
(2026-04-01 → 2026-09-23, 3000 tradeable candles, 85 forecast trades).

## Central answer

> Given only information available at entry, can we identify a subset of EUR/USD
> conditions with positive net expectancy after realistic costs?

**Verdict: NO — UNSUPPORTED.** The single-holdout +4.94% did not survive P&L
walk-forward. Pooled across 5 retrained folds (343 OOS trades), expectancy is
**+0.008R at the 0.45 threshold (CI [−0.14,+0.16], ≈ zero)** and turns
**negative** as the threshold rises (−0.037R at 0.50, −0.151R at 0.55) — the
opposite of what the single-holdout calibration suggested. Short-only at 0.50 is
a coin flip (+0.019R, CI [−0.21,+0.26]). The pipeline is clean (no lookahead);
the classification signal (+4pp accuracy) is real but **does not convert into a
tradable, costed edge across time**. The apparent profit was regime luck +
small-sample noise, concentrated in ~10 thin-session trades.

---

## A. Current system diagnosis
An H1, single-position, 2:1 RR system. The tradeable "edge" is the ML forecast
(`forecast_signal`): trade the predicted class when confidence ≥ 0.45. The agent
coordinator does **not** beat it (prior evidence). It is **not a scalper**:
0.49 trades/day, mean holding 10.7 bars (~10.7h), median 5 bars.

## B. Current backtest results (EUR/USD, with 0.6 spread + 0.1 slip)
n=85 · win 36.5% · avg win +1.97R · avg loss −1.03R · expectancy **+0.067R** ·
profit factor **1.10** · total +5.70R · return **+4.94%** · maxDD ~10.5% ·
max losing streak 7 · long 54 / short 31.

## C. Result reconciliation
Fully explained by transaction cost — same 85 trades throughout:
| Config | totalR | return |
|---|---|---|
| 0 cost | +8.00 | +7.38% |
| spread 0.6 only | +5.25 | +4.46% |
| spread 0.6 + slip 0.1 | +5.70* | +4.94% |

(*slippage is applied symmetrically and interacts with per-trade sizing, so the
0.6+0.1 total is not simply below the 0.6-only total; both are within noise.)
The earlier "+7.38 vs +4.94" gap was **zero-cost vs costed**, nothing else. See
`BACKTEST_RESULT_RECONCILIATION.md`.

## D. Backtest integrity
No lookahead found. Entry is causal (signal ≤ k−1, fill at k open); features are
backward-looking; labels drop the forward tail; split is chronological.
Caveats: **mid-price data** with a modeled flat spread; entry-bar stop not
re-checked (mildly optimistic); drawdown sampled only at trade closes. See
`BACKTEST_INTEGRITY_AUDIT.md`.

## E. Forecast model — calibrated but sample-starved
Realized win rate rises monotonically with predicted confidence:
| confidence | n | win% | expR |
|---|---|---|---|
| (0.45, 0.50] | 65 | 32.3 | −0.059 |
| (0.50, 0.55] | 16 | 43.8 | +0.289 |
| (0.55, 0.60] | 4 | 75.0 | +1.233 |
The probabilities are **meaningful** (genuine calibration), but only ~20 trades
sit in the profitable buckets. The 0.45 threshold admits 65 losing trades.

## F. Where positive expectancy actually is
Short trades (+0.23R, n31), high-confidence trades (≥0.50, +0.29 to +1.23R),
and — spuriously — thin sessions (Asia/late-NY/NY, n=10, +13.8R combined).

## G. Weakest conditions
Longs (−0.03R, n54). **London (−3.58R, n21) and London/NY overlap (−4.50R,
n54)** — i.e. the liquid sessions, which hold 75 of 85 trades, collectively LOSE
−8.08R. All net profit is the 10 off-peak trades.

## H. Repeated setup / clustering
Median gap 19 bars; 28 trades within 6 bars, 57 isolated. Lag-1 autocorrelation
of R = −0.088, effective N ≈ 85 (≈ raw). Trades are **roughly independent** — so
the small-sample problem is real N≈85, not hidden duplication. (Clustered trades
actually did better, +0.26R vs −0.03R isolated — trend continuation, small n.)

## I. Execution reality
Mid prices only. Flat 0.6-pip spread **understates** true spreads in the exact
thin sessions (Asia/late-NY) that carry all the profit — so real-world net is
likely **worse** than +4.94%. Break-even spread on this sample is > 2.0 pip, but
that is propped up by the mispriced thin-session winners.

## J. Scalping suitability
Fails. 0.49 trades/day, multi-hour holds. This is a swing system on H1; the
intended M1/M5 scalper does not exist in the codebase.

## K. OOS / walk-forward — DONE, and it fails
Classification walk-forward (5 folds) shows a stable **+4.0pp** accuracy edge.
But **P&L walk-forward** (5 retrained folds, 343 pooled OOS trades, costs on;
`research/walkforward_eurusd.py`) shows the accuracy does **not** convert to a
tradable edge:
| threshold | n | win% | expR | totalR | CI95 | P(exp≤0) |
|---|---|---|---|---|---|---|
| 0.45 | 343 | 34.4% | +0.008 | +2.90 | [−0.14,+0.16] | 0.47 |
| 0.50 | 207 | 32.9% | −0.037 | −7.55 | [−0.23,+0.15] | 0.64 |
| 0.55 | 155 | 29.0% | −0.151 | −23.40 | [−0.36,+0.06] | 0.91 |
| 0.50 short-only | 147 | 34.7% | +0.019 | +2.74 | [−0.21,+0.26] | 0.46 |

Per-fold (thr 0.50): [−0.8, −8.1, −7.2, +7.8, +0.8]. Raising the threshold makes
it **worse** — the single-holdout calibration was noise. **No threshold's CI
clears zero.**

## L. Robustness
- Statistical: expectancy 95% CI **[−0.22, +0.38]R**, P(expectancy≤0)=**37%**.
- Session: profit concentrated in 10/85 trades → fragile.
- Cost: survives to ~2 pip on paper, but only via mispriced thin-session trades.
- Parameter / Monte Carlo / regime: **pending**.

## M. Cross-pair evidence
Forecast positive on 4/5 pairs (loses GBP), coordinator on 3/5. The signal is a
weak, USD-macro-flavored effect, not EUR/USD-specific magic — consistent with a
small real classification edge plus noise, not a robust tradable system.

## N. Recommended architecture (evidence-backed only)
1. **Raise the confidence threshold** to ≥0.50 (calibration says the 0.45–0.50
   bucket loses). Evidence-based, but shrinks n → must be re-validated OOS.
2. **Session filter**: the liquid-session trades lose; do not add "trade only
   thin sessions" — that is fitting to 10 trades. Instead treat session as a
   research variable and demand OOS proof.
3. **Do not build the dashboard / live layer on this yet** — the edge isn't proven.

## O. Remaining unknowns (must-do before any trust)
P&L walk-forward across multiple OOS windows · Monte Carlo on trade order/costs ·
parameter-neighborhood robustness · session-realistic spreads · regime split ·
news-window effect · confidence-threshold re-validation on unseen data ·
larger sample (more history / more pairs pooled).

## P. Final confidence
**Unsupported.** After P&L walk-forward, there is a genuine, calibrated
*classification* signal (+4pp, stable across folds) that does **not** translate
into a statistically defensible *trading* edge after costs — pooled OOS
expectancy is ≈ zero and turns negative when made more selective. Not overfitting
or lookahead; just a real-but-untradable signal that a single headline backtest
over-flattered. **Do not trade this system or build execution on it.**

---

## Most important next step (updated — walk-forward is done)
The ≥0.50 hypothesis was tested and **failed** walk-forward. The honest
conclusion stands: **the forecast has predictive signal but not a bankable
EUR/USD trading edge.** Do not build the dashboard / paper / live layers on it.
Genuinely different directions if you want to keep going:
1. **More/finer data** — the H1 sample is too small and coarse for a scalper;
   real M1/M5 data + far more history is the prerequisite for any scalping edge.
2. **Different target** — model the *distribution / volatility* or a
   cost-aware "trade vs no-trade" meta-label, not next-bar direction.
3. **Accept the negative result** — this system is a well-built research
   platform that has, honestly, not yet found a tradable edge on EUR/USD H1.
