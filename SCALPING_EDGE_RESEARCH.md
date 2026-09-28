# SCALPING_EDGE_RESEARCH.md

Where (if anywhere) does EUR/USD positive expectancy actually live? Evidence from
`research/forensics_eurusd.py` (85 forecast trades, EUR_USD H1 holdout,
2026-04-01 → 2026-09-23, costs 0.6 spread + 0.1 slip). See `TRADE_ANALYSIS.csv`.

## 1. Conditional expectancy by forecast confidence (the strongest signal)
| confidence bucket | n | win% | expectancy R |
|---|---|---|---|
| (0.45, 0.50] | 65 | 32.3% | **−0.059** (loses) |
| (0.50, 0.55] | 16 | 43.8% | +0.289 |
| (0.55, 0.60] | 4 | 75.0% | +1.233 |

Monotonic → the model is **calibrated**; probability carries real information.
But the profitable region is ~20 trades. **The 0.45 entry threshold is too low.**

## 2. Session (decisive — profit is concentrated & fragile)
| session (UTC) | n | win% | total R |
|---|---|---|---|
| Asia | 4 | 75% | +4.90 |
| late NY | 4 | 75% | +4.93 |
| New York (16–20) | 2 | 100% | +3.96 |
| London (07–12) | 21 | 28.6% | **−3.58** |
| London/NY overlap (12–16) | 54 | 31.5% | **−4.50** |

**All +13.8R of profit comes from 10 thin-session trades; the 75 liquid-session
trades lose −8.1R.** In reality, Asia/late-NY spreads are 2–5+ pip (not 0.6), so
those winners are **overstated**. This is the single biggest reason the edge is
not trustworthy.

## 3. Direction
long: n=54, expR −0.028 (dead). short: n=31, expR +0.233. Edge is short-only.

## 4. MAE / MFE (R units)
Winners take little heat (MAE p50 0.29). Losers rarely run our way first (MFE
p50 0.43) → a break-even/trailing stop would capture little. Stops (~1R, MAE p90
1.96) are appropriately placed; no cheap exit-tuning win visible.

## 5. Trade independence
Median gap 19 bars, lag-1 autocorr(R) −0.088, effective N ≈ 85. Trades are
roughly independent — so the weakness is genuine small sample, not duplication.

## 6. Scalping suitability — FAILS
- trades/day: **0.49** (≈ one trade every two days)
- mean holding: **10.7 bars (~10.7 h)**, median 5 bars (~5 h)
This is an H1 swing/position system. The intended M1/M5 EUR/USD scalper (holding
seconds-to-minutes, several trades/session) **does not exist** — there is no
sub-H1 data or model. Building a scalper requires new M1/M5 ingestion + models,
not a tweak of this system.

## 7. Candidate setup (promising, NOT proven)
"EUR/USD forecast short, confidence ≥ 0.50" is the only combination with
evidence of positive expectancy that isn't pure session-fitting. Sample: ~10–20
trades → **insufficient**. Must be re-validated with P&L walk-forward on more
history before it can be called an edge.

## 8. What does NOT have an edge here
- Order blocks / FVG / liquidity sweeps: not used by the forecast; prior
  `sweep-backtest` already found no standalone edge.
- Longs; London/overlap sessions; the 0.45–0.50 confidence band.
