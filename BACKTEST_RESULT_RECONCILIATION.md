# BACKTEST_RESULT_RECONCILIATION.md

Reconciles the discrepancy between the standalone forecast run (+7.38% / DD
9.08%) and the all-pairs EUR/USD forecast run (+4.94% / DD 10.54%), both 85
trades. Source: `research/forensics_eurusd.py`, one dataset, one model version.

## Root cause: transaction costs (nothing else)

The two runs used the **same 85 trades on the same holdout** (EUR_USD H1,
2026-04-01 → 2026-09-23). The only difference is the cost model, which was added
to the runner scripts between the two runs:

| Run | spread | slippage | total R | return |
|---|---|---|---|---|
| standalone `run_forecast` (old) | 0.0 | 0.0 | +8.00 | **+7.38%** |
| all-pairs / current `run_forecast` | 0.6 pip | 0.1 pip | +5.70 | **+4.94%** |
| (spread only, control) | 0.6 pip | 0.0 | +5.25 | +4.46% |

## Checklist (all identical except cost)
- Dataset / candles: identical (15,000 EUR_USD H1, same DB).
- Start/end timestamps: identical.
- Initial capital: identical (10,000).
- Risk sizing: identical (1%).
- Warmup: identical (260).
- Model version: identical (single latest EUR_USD H1 h1 model).
- Execution logic: identical engine.
- Equity/drawdown calc: identical.
- **Costs: DIFFERENT** — the sole cause.
- Trade set: identical (85), verified by the instrumented rebuild.

## Conclusion
No hidden configuration drift, no data change, no code bug. The "improvement" or
"degradation" between the two headline numbers was **entirely** the introduction
of realistic spread + slippage. The honest, costed figure is **+4.94%**, and
even that is within statistical noise (see `CLAUDE_FINDINGS.md` §L). The
zero-cost +7.38% should be discarded as non-executable.
