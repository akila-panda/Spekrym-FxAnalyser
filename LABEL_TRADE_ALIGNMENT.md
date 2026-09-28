# LABEL_TRADE_ALIGNMENT.md

Research-only audit: does the forecast's training label represent the event the
trading engine actually monetizes (TP before SL, after costs)? Evidence:
`research/label_trade_alignment.py`, `LABEL_TRADE_ALIGNMENT.csv`, 343 forecast
trades across 5 walk-forward OOS folds (EUR_USD H1, costs 0.6 spread + 0.1 slip).
**No production code was modified.**

## 1. Executive conclusion
**PARTIALLY ALIGNED.** The 1-bar label carries genuine information that transfers
to trades (a correct 1-bar call wins **52%** vs **24%** when wrong), and it
produces a TP-first rate (**34.4%**) just above the 2:1 break-even (33.3%). But
the alignment is weak and the residual edge is razor-thin: **76% of trades outlive
the 1-bar label horizon**, **43% of winning trades came from a WRONG directional
label**, and realistic costs erase ~89% of the gross edge (gross +0.079R → net
+0.0085R). The label predicts a *related but different* event from the one the
engine monetizes.

## 2. Current label definition (from code, exact)
`forecast/features.py::make_labels(horizon=1, atr_mult=0.25)`:
- prediction at bar t uses features ≤ t; **horizon = 1 H1 bar**; price = close.
- `fwd_return = close.shift(-1)/close − 1`; **threshold = 0.25 × ATR14/close**;
  up if fwd_return > threshold, down if < −threshold, else flat.
- **No costs, no SL/TP, no path/order** — endpoint return only.

## 3. Actual trade outcome definition
Engine fills at next bar's open; exits when SL or TP is touched (SL checked
first → simultaneous-bar ties counted as SL, pessimistic). Independent replay
here confirms TP_FIRST / SL_FIRST / NEITHER per trade from raw highs/lows.

## 4. Label class × trade outcome (traded set, n=343)
| label_class | TP_first | SL_first | total |
|---|---|---|---|
| up | 35 | 96 | 131 |
| down | 46 | 83 | 129 |
| flat | 37 | 46 | 83 |
| **All** | **118** | **225** | **343** |

(“flat” rows = bars whose true 1-bar label was flat but the model predicted a
direction and traded.) No trade ended NEITHER — all resolved to SL/TP.

Predicted direction × outcome: up → 59 TP / 116 SL; down → 59 TP / 109 SL — both
~34% TP-first, symmetric.

## 5. Hit-order analysis
TP_FIRST 34.4% · SL_FIRST 65.6% · NEITHER 0% · BOTH_SAME_BAR handled as SL
(engine treatment preserved). avg time-to-TP **11.8 bars**, time-to-SL **8.9 bars**.

## 6. Holding-period alignment
Median holding **5 bars**, mean **9.9**. **76.4% of trades exit AFTER the 1-bar
label horizon; only 23.6% resolve within it.** The label horizon and the trade
horizon are not the same scale.

## 7. Future-return vs path (Type analysis)
| Type | meaning | n |
|---|---|---|
| 1 | label-correct & TP-first | 67 |
| 2 | label-correct & SL-first (correct call, lost) | **61** |
| 3 | label-wrong & TP-first (wrong call, won) | **51** |
| 4 | label-correct & not TP-first | 61 |

Of 128 label-correct trades only 67 (52%) won; of 118 winners, **51 (43%) had a
WRONG 1-bar label**. The endpoint-return label and the barrier outcome are only
loosely coupled.

## 8. Cost alignment
gross expectancy **+0.0793R** → net **+0.0085R**; cost drag **−0.071R/trade**
(≈89% of the gross edge). A thin statistical edge that is not economically
survivable at 0.6-pip spread.

## 9. SL/TP distance vs label threshold
Label threshold ≈ 0.25×ATR (a fraction of one ATR). SL ≈ 1×(ATR-based) risk,
TP ≈ 2×. So the label asks "will the next bar move >0.25 ATR?" while the trade
needs "move +2 ATR before −1 ATR over many bars" — different magnitudes and
different horizons.

## 10. Five-fold walk-forward
| fold | n | dir_acc (1-bar) | TP-first | gross expR | net expR | med hold |
|---|---|---|---|---|---|---|
| 0 | 116 | 0.336 | 0.302 | −0.087 | −0.114 | 5 |
| 1 | 106 | 0.443 | 0.406 | +0.402 | +0.192 | 5 |
| 2 | 35 | 0.371 | 0.200 | −0.400 | −0.421 | 5 |
| 3 | 44 | 0.273 | 0.341 | +0.023 | −0.002 | 4 |
| 4 | 42 | 0.405 | 0.429 | +0.286 | +0.253 | 6 |

Mismatch is **regime-dependent**: losing folds are gross-negative too (not just
costs) and coincide with higher volatility (see TARGET_ALIGNMENT_FORENSICS.md).

## 11. Representative trades (from the CSV, real)
- **A (correct+TP):** 2025-07-15 06:00 short, pred down, label down, TP, hold 7, MFE 3.01R, gross +2 / net +1.97.
- **B (correct+SL):** 2025-07-10 15:00 long, pred up, label up, **SL**, hold 39, MFE 1.63 (never reached +2R), gross −1 / net −1.02. Correct direction, lost trade.
- **C (wrong+TP):** 2025-07-10 01:00 short, pred down, **label flat**, TP, hold 11, gross +2 / net +1.98. Won despite a non-directional label.
- **D (path mismatch):** 2026-08-27 15:00 short, label up, **SL first** yet MFE 4.43R later — direction eventually right, but the stop was hit first.
- **E (costs bite):** 2026-08-27 10:00 long, TP, gross +2 → net +1.95; on losers this ~0.05R drag flips marginal trades.

## 12. Direction → path → economic decomposition
| level | metric | value |
|---|---|---|
| A direction (all bars) | 1-bar accuracy | 41.3% (+3.3pp) |
| A direction (traded) | 1-bar accuracy | **37.3%** (≈ baseline) |
| B path | TP-first rate | 34.4% (bkeven 33.3%) |
| C economic (gross) | expectancy | +0.079R |
| C economic (net) | expectancy | **+0.0085R** |

Degradation happens twice: **(i) direction→path** — the confidence filter selects
bars whose 1-bar accuracy (37.3%) is no better than baseline, and the multi-bar
barrier race further weakens it to a 34.4% TP-first rate; **(ii) gross→net** —
costs erase the thin remainder.

## 13. Alternative target concepts (research hypotheses only — NOT built)
- **Binary barrier:** label = TP_FIRST vs SL_FIRST within N bars (the exact event
  the engine monetizes).
- **Triple barrier:** TP_FIRST / SL_FIRST / TIMEOUT.
- **Cost-aware barrier:** barriers net of spread+slippage.
These would align the supervised target with the payoff. Diagnosis only — no
horizon/SL/TP/threshold search performed, per the mandate.

## 14. Primary mismatch
> **The primary mismatch occurs between direction (1-bar horizon) and path
> (multi-bar SL/TP), and is then finished off between gross path outcome and net
> economic expectancy (costs).**
The label predicts a 1-bar endpoint move; the engine monetizes a multi-bar
barrier race. 76% horizon overrun and 43%-of-winners-from-wrong-labels are the
direct evidence.

## 15. Recommended next research step
Run a **diagnostic** comparison of a triple-barrier (TP-before-SL) target against
the current 1-bar label — measure only whether a barrier-aligned target has a
higher, cost-survivable OOS expectancy under the *same* walk-forward and *no*
parameter search. If it does not clear zero either, the honest conclusion is that
the predictive signal is real but too weak to monetize through this SL/TP engine.

---

## FINAL VERDICT
**PARTIALLY ALIGNED.** The label is informative (correct calls win 2.2× more) and
barely clears the barrier break-even gross, so it is *not* misaligned in the sense
of predicting an unrelated event. But there is a **material horizon/path mismatch**
(1-bar target vs ~10-bar SL/TP race) and the surviving edge is **too thin for
costs**. The forecast label does **not** cleanly represent the event the engine
monetizes — it is a weakly-correlated proxy for it.

_STOP per mandate §20: no label change, no retrain, no threshold/SL/TP/feature/
coordinator changes made. Next decision to be taken from this document._
