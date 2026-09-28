# BACKTEST_INTEGRITY_AUDIT.md

Adversarial search for lookahead, execution bias, and simulation artifacts in
the forecast pipeline. Conclusion up front: **no lookahead found**; the residual
risks are execution realism (mid prices) and a couple of mildly optimistic
simulation shortcuts, none of which manufacture the observed result.

## Lookahead / leakage — cleared

| Vector | Finding | Evidence |
|---|---|---|
| Future candles in features | None | `forecast/features.py` uses only `pct_change`/rolling (backward). |
| Centered/lookahead windows | None in features | swings are centered (`support_resistance.py`) but the forecast strategy does not use them. |
| Future label leak | None | `make_labels` uses `shift(-horizon)`; `build_dataset` drops the last `horizon` rows. |
| Train/test contamination | None | `_time_split` chronological; model trained on first 80%, backtest holdout = last 20%; no overlap (same 15k rows). |
| Signal/fill same bar | None | engine builds signal from `df[:k]` (≤ k−1), fills at `df[k]` open. |
| Model fit on future | None | single model, fit before holdout window; walk-forward eval expands only backward. |

**When is each forecast feature knowable?** All 19 features are functions of
closes/highs/lows/volume up to and including the signal bar (k−1); entry is the
next bar's open (k). Knowable-at ≤ entry for every feature. No violation.

## Execution realism — the real caveats

1. **Mid-price data.** OANDA `price="M"`. All fills = mid ± a *modeled* flat
   spread. Real bid/ask, rollover widening, and news spikes are absent. This
   **flatters thin-session trades**, which is exactly where this strategy's
   profit sits (Asia/late-NY carry the P&L; their real spreads are far above
   0.6 pip). Net real-world result is likely **worse** than reported.
2. **Entry-bar stop not re-checked.** Exits scanned from k+1; a stop that would
   hit on the entry bar is missed → mildly optimistic.
3. **Intrabar SL+TP ambiguity.** If a bar spans both, engine takes the **stop**
   (loss) → conservative. Good.
4. **Drawdown granularity.** Equity sampled only at trade closes → intratrade
   drawdown understated. Reported DD is a floor, not a ceiling.
5. **H1 resolution for a "scalper".** No M1/M5 data to resolve intrabar path;
   MAE/MFE are H1-approximate.

## Verdict
The +4.94% is **not** an artifact of lookahead or train/test contamination — the
pipeline is causally sound. It **is** partly an artifact of optimistic execution
(flat spread in thin sessions) and, more importantly, of **small-sample noise**
(see `CLAUDE_FINDINGS.md` §L). Fix priorities: session-realistic spreads, and
P&L walk-forward on more data — not bug fixes.
