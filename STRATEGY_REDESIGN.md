# STRATEGY_REDESIGN.md

Proposed changes, classified strictly by evidence. **No change here is
implemented yet** — each must pass P&L walk-forward + robustness first (see the
implementation rule at the bottom). Nothing is adopted merely because it improves
the single historical backtest.

## PROVEN (survives OOS evidence today)
*(none)*

Honest state: nothing yet clears the bar of "statistically defensible, costed,
out-of-sample." The classification-level +4.0pp edge is stable across 5 folds,
but its **P&L** translation is not yet significant (expectancy CI spans zero).

## PROMISING (evidence exists, sample too small to confirm)
*(none survived — the former candidates were tested and rejected below)*

## UNPROVEN (theoretical only — do not build yet)
- Multi-timeframe (H1→M15→M5→M1) scalping architecture. Plausible and matches the
  stated goal, but there is **no sub-H1 data or model**; must be built and tested
  from scratch, not assumed.
- News/economic-surprise filter (no historical calendar stored to test it).
- Any FVG / liquidity-sweep entry logic.

## REJECTED (tested, not useful)
- **Confidence threshold ≥ 0.50 / ≥ 0.55** — FAILED P&L walk-forward. Pooled OOS
  (343 trades) expectancy turns *more negative* as the threshold rises
  (+0.008R → −0.037R → −0.151R). The single-holdout calibration was noise.
- **Short-only ≥ 0.50** — walk-forward expectancy +0.019R, CI [−0.21,+0.26]: a
  coin flip, not an edge.
- **Order-block / price-action direction voting** — the coordinator (which adds
  it) does not beat the plain forecast, and prior `sweep-backtest` found SMC has
  no standalone edge.
- **Coordinator as a more-active trader** — overtrades, adds drawdown, no
  risk-adjusted gain after costs.
- **0.45 confidence threshold** — admits 65 losing low-confidence trades.
- **"Trade only thin sessions"** — would be fitting to 10 trades; and real
  thin-session spreads erase the paper profit. Do NOT implement.
- **Treating the zero-cost +7.38%/+29.6% numbers as real** — non-executable.

## Implementation rule (mandatory, per mandate §40)
Before ANY change ships:
```
Problem → Hypothesis → Evidence → Expected mechanism → Test
→ OOS result → Robustness (params/cost/regime/Monte Carlo) → Decision
```
Adopt only if the OOS expectancy confidence interval clears zero after realistic,
session-aware costs. Otherwise: keep researching, do not trade.

## Recommended immediate next action
Run the **confidence ≥ 0.50 hypothesis through P&L walk-forward** (retrain per
fold, trade each unseen fold, costs on). If it clears zero → promote to PROVEN
and paper-trade it. If not → the honest conclusion stands: predictive signal
exists, a bankable EUR/USD trading edge does not (yet); gather more data before
building the dashboard or live execution.
