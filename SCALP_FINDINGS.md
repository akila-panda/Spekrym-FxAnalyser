# SCALP_FINDINGS.md

Verdict on the EUR/USD 1-minute scalping investigation (Phases A–D). Built and
run exactly as specified in `SCALP_PHASE_A..E`. Honest conclusion first, evidence
below.

## VERDICT: NO-GO

**There is no systematic, executable scalping edge in EUR/USD M1 via HTF-trend +
confluence entries.** The entries have *negative short-term expectancy* and the
real spread guarantees a loss on top. Per the Phase D rule, we do NOT proceed to
paper trading and do NOT tune toward a green curve.

---

## What was built and verified
- **Phase A** — ingested 740k EUR/USD **M1 bars with real bid/ask** (OANDA MBA);
  measured the true spread. `research/spread_profile.py`, migration `004_bidask`.
- **Phase B** — `backtest/scalp_engine.py`: bid/ask fills (buy ask / sell bid),
  fixed-pip SL/TP, session/spread/time gates, 0.01-lot P&L. **Acceptance test
  passed**: a flat-market always-long nets ≈ −spread (cost modeled correctly).
- **Phase C** — `market_context/scalp_strategy.py`: HTF-trend → M15 discount/
  premium → M5 FVG/liquidity zone → M1 trigger. Both **momentum** and **pullback**
  triggers. 171 tests green.
- **Phase D** — `research/scalp_validate.py`: walk-forward, bootstrap CI, MAE/MFE,
  net of the real spread.

## The real spread (Phase A)
EUR/USD OANDA median spread = **1.6 pips** in London/NY (stable; p90 1.7; 21:00
rollover spikes to 2.7–6). A 5-pip target gives up **32% to spread**, requiring a
**~66% win rate** just to break even.

## Phase C first result (momentum trigger, 200k M1 bars)
180 trades (1.94/day — not high-frequency), win **18.9%**, avg **−2.10 pips**,
total **−$37.82**. Exits: TP 24 / SL 120 / time 34.

## Phase D head-to-head (net of 1.6-pip spread)
| Trigger | n | win% | avg net pips | CI95 | P(<=0) | folds+ |
|---|---|---|---|---|---|---|
| momentum | 180 | 18.9% | -2.10 | [-2.57, -1.62] | 100% | 0/4 |
| pullback | 180 | 22.8% | -2.06 | [-2.52, -1.59] | 100% | 0/4 |

Both deeply negative, in **every fold**. Flipping momentum→pullback moved the win
rate 4 points but not the sign.

## The decisive diagnostic: MAE/MFE
- **MFE p50 = 0.5 pips** — the median trade's maximum favorable move is half a pip.
  It essentially never goes in your favor.
- **MAE p50 = 4.1 pips** — the median trade runs ~4 pips against (to the stop).
- Only the top ~10% of trades reach the 5-pip target (MFE p90 ≈ 5.1).

**Interpretation:** the entries have negative short-term expectancy — after entry,
price systematically moves ~4 pips against and ~0.5 for. Causes: (1) 1-minute
price is mean-reverting/noise, so trend/displacement entries buy the exhaustion;
(2) you start every trade 1.6 pips underwater (enter at ask, MFE on bid).

**No TP/SL tuning fixes an entry with MFE 0.5 / MAE 4.1.** A smaller target catches
a few more but the spread makes it net-negative; a wider stop loses more. The
entry itself carries no edge — and even a 0.6-pip ECN spread wouldn't rescue a
0.5-pip median MFE.

## Where this sits in the whole investigation
Seventh independent negative result, and the first at the exact resolution and
instrument the goal specified (EUR/USD M1) with real bid/ask. Consistent with:
`sweep-backtest` (SMC no edge), the ML forecast audit, the H1/M5 confluence tests,
and the level-to-level test (`hit rate = fair rate`).

## What remains (evidence-backed)
- Technical / ICT direction-prediction on EUR/USD is **exhausted** across H1/M5/M1.
- Different odds require **different information**, not more entry variations:
  cross-sectional carry/momentum across many pairs, relative-value / cointegration,
  or non-price data (rates/flow, crypto funding/basis). Separate projects with
  their own (low but non-zero) base rates.

## Reproduce
```
python -m research.spread_profile EUR_USD
python -m backtest.run_scalp EUR_USD 200000
python -m research.scalp_validate EUR_USD 200000
```
Artifacts: `SCALP_TRADES.csv`, `backtest/scalp_engine.py`,
`market_context/scalp_strategy.py`, `research/scalp_validate.py`.
