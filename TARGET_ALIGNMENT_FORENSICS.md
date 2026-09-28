# TARGET_ALIGNMENT_FORENSICS.md

Diagnosis pass (no strategy changes) explaining why a real classification edge
produces ~0R trading expectancy. Evidence: `research/target_alignment_forensics.py`,
5-fold expanding walk-forward, EUR_USD H1, in-memory models, costs 0.6+0.1.

## Q1 — Why does +3.3pp classification edge become ~0R P&L?
Two compounding causes:

1. **The edge is thin, and costs erase it.** Pooled OOS:
   - pre-cost expectancy **+0.059R** (positive, totalR +20 over 337 trades)
   - post-cost expectancy **+0.0085R** (~zero)
   - cost drag **−0.051R/trade** → costs remove ~85% of the pre-cost edge.
   Costs *are* responsible for turning marginal-positive into flat — but the
   pre-cost edge was already too small to pay a 0.6-pip spread.

2. **The signal only partially transfers to the trade outcome** (see Q3).

Pooled OOS 1-bar classification accuracy = **41.3%** vs baseline 38.1% =
**+3.28pp** over N=7,499 — the predictive signal is real and stable.

## Q2 — Is it regime-dependent? YES (volatility)
Per-fold P&L tracks **realized volatility**, not accuracy:

| fold | totalR | acc edge | realized vol | trend-eff |
|---|---|---|---|---|
| 0 | −13.27 | +3.7pp | 0.092% | 0.00 |
| 1 | **+20.36** | +4.0pp | **0.063%** | 0.00 |
| 2 | −14.73 | +2.4pp | 0.089% | 0.01 |
| 3 | −0.08 | +2.5pp | 0.072% | 0.02 |
| 4 | **+10.62** | +3.7pp | **0.059%** | 0.01 |

Accuracy is ~constant across folds; **P&L is not**. The two profitable folds have
the two lowest volatilities; the two worst losers have the highest. trend-eff ≈ 0
and up-fraction ≈ 50% everywhere → not a trend effect. **The system is implicitly
a low-volatility bet**: the same directional edge pays in calm regimes and gets
whipsawed out (1R stop hit before 2R target) in volatile ones.

## Q3 — Is the target aligned with the trade objective? PARTIALLY — the core flaw
The model is trained on a **1-bar** ATR-thresholded direction label, but the trade
is a **2:1 SL/TP race over ~10 bars**. These are related but different events:

| 1-bar prediction | n | trade win% | expR |
|---|---|---|---|
| CORRECT | 128 | **52.3%** | +0.546 |
| WRONG | 215 | 23.7% | −0.312 |

- corr(1-bar-correct, trade-won) = **+0.29** — the signal transfers, but weakly.
- **P(trade wins | 1-bar call correct) = 0.52**, not ~1.0. A correct *next-bar*
  call does not deliver a +2R excursion-before-stop over ten bars.
- Only ~37% of trades had a correct 1-bar call to begin with.

So a genuine 1-bar edge is **diluted** (100% → 52%) by the mismatch between the
prediction horizon and the exit mechanism, then the residual is eaten by costs.

## Conclusion
**The current forecast architecture has predictive information but no demonstrated
trading edge.** The information is real (+3.3pp, stable OOS) and partially
transfers to trades, but three things block profitability, in order of importance:
1. **Target misalignment** — predicts 1-bar direction, not "hits +2R before −1R
   within N bars." (Fixable in principle via a triple-barrier / meta-label target.)
2. **Regime dependence** — only profitable in low volatility.
3. **Thin edge vs costs** — what survives 1→2 is too small to pay the spread.

## Architectural hypotheses to TEST later (not implemented; not optimization)
- **Triple-barrier label**: train directly on the trade's own outcome (TP before
  SL within N bars, ATR-scaled). This is the single most justified change — it
  aligns the target with the payoff. Must be validated by walk-forward.
- **Volatility conditioning**: economically justified (system is a low-vol bet),
  but must clear OOS before adoption, not fitted to these 5 folds.
- Neither should be built until it passes walk-forward with a CI clearing zero.
