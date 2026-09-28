# SYSTEM_STRATEGY_AND_EDGE.md

Complete technical dossier of the Spekrym-FX system: every strategy, the exact
math, the code, and the measured edge results. Self-contained for handoff to
another model/engineer. Instrument focus: EUR_USD (+ GBP_USD, USD_JPY, AUD_USD,
USD_CAD). Data: OANDA **mid** OHLCV, TimescaleDB, ~2 years, H1 native (15k bars)
+ M15/M5 native + H4/D1 resampled from H1.

---

# 0. TL;DR of the edge situation

Adversarial test of whether any price-derived signal produces positive net
expectancy after costs on FX majors. Results (all out-of-sample, costs on):

| Approach | Result |
|---|---|
| ML next-bar direction (forecast) | +4.0pp classification accuracy OOS, but ~0 trading expectancy after costs; walk-forward expectancy CI straddles 0 |
| SMC order-block reclaim | no edge |
| Multi-agent confluence coordinator | does not beat the raw forecast; overtrades |
| Confluence-as-filter on fixed 2:1 (trend / premium-discount / session / displacement) | every group <= break-even, negative net expectancy |
| Level-to-level (liquidity target / structure stop) | realized hit rate = geometric fair rate -> zero directional information |
| Same tests on M15 / M5 | no edge; cost tax worsens (M5 costs eat ~57% of R) |

**Conclusion: no exploitable single-pair directional edge in this data after
costs.** The machinery below is correct; the market is efficient at this task.

---

# 1. Data & pipeline
- Source: OANDA v3 candles, `price="M"` (midpoint). Circuit breaker + retry.
- Store: TimescaleDB hypertable `candles(pair, tf, ts, o, h, l, c, v, complete)`.
- Load: `ta_engine/loader.py` — native M1..H1, resample H1->H4/D1
  (`o=first,h=max,l=min,c=last,v=sum`).
- Causality rule: a signal at bar k uses only candles <= k-1, filled at bar k open.

---

# 2. Forecasting model (main edge candidate)

## 2.1 Features (19, backward-looking) — `forecast/features.py`
```
ret_1,3,6,12,24 = C.pct_change(n)
rsi14           = RSI(C,14)/100
macd_hist_norm  = MACD_diff(C)/C
atr14_norm      = ATR(H,L,C,14)/C
atr_regime      = ATR14 / ATR14.rolling(50).mean()
bb_pct          = (C-BB_low)/(BB_high-BB_low)     # BB(20,2)
bb_width_norm   = (BB_high-BB_low)/C
sma20_slope     = SMA20.pct_change(5)
sma50_slope     = SMA50.pct_change(5)
ema20_dist_norm = (C-EMA20)/C
vol_zscore      = (V-V.rolling(50).mean())/V.rolling(50).std()
hour_sin/cos    = sin/cos(2*pi*hour/24)
dow_sin/cos     = sin/cos(2*pi*dow/7)
```

## 2.2 Label — `make_labels(horizon=1, atr_mult=0.25)`
```
fwd_return = C.shift(-horizon)/C - 1
threshold  = atr_mult * (ATR14 / C)         # 0.25 * ATR/price
label = +1 if fwd_return > threshold ; -1 if < -threshold ; else 0
# last horizon rows dropped
```
Known flaw: horizon=1 bar, but trades hold ~5-11 bars for a 2:1 race -> target
misaligned with payoff (see section 7).

## 2.3 Model — `forecast/model.py`
```
HistGradientBoostingClassifier(max_iter=300, max_depth=6,
    learning_rate=0.05, l2_regularization=1.0, random_state=42)
```
Chronological split (no shuffle): train first 80%, holdout last 20%.
predict_distribution -> {distribution:{up,flat,down}, predicted_class, confidence=max prob}.

## 2.4 Measured performance
Holdout acc ~0.41-0.43 vs majority baseline ~0.38 (+2.5..+5.6pp by pair);
5-fold walk-forward EUR_USD mean edge +4.0pp stable. But trading nets ~0 after costs.

---

# 3. Trading strategies

## 3.1 Forecast-signal — `backtest/strategies/forecast_signal.py`
```
if confidence >= 0.45 and predicted_class != "flat":
    direction = "long" if predicted_class=="up" else "short"
```
EUR_USD OOS (costs 0.6+0.1 pip): 85 trades, win 36.5%, +4.94%, maxDD 10.5%,
expectancy +0.067R; bootstrap 95% CI [-0.22,+0.38]R, P(exp<=0)=37%. Not significant.

## 3.2 Order-block reclaim — `backtest/strategies/order_block_reclaim.py`
After BOS, order block = last opposite-colored candle. Long when price dips into a
bullish OB zone [low,high] and closes back above the OB high; short mirror. No edge.

## 3.3 Coordinator — `agents/`
Trees -> AgentVerdict(bias, confidence in [0,1]); signed = sign*conf.
Weights: technical 0.60 (Forecast 2.0, PriceAction 1.3, Volatility abstains, CrossRate 0.7),
fundamental 0.25, sentiment 0.15. net = sum(w_tree*signed)/sum(w_tree over trees with a view).
Gates -> HOLD: news_blackout, dead_volatility, no consensus, |net|<0.12, conf<3/10.
confidence(1-10)=|net|*10*agreement_ratio; risk% = 0.5 + 1.0*(conf/10).
Does not beat the raw forecast; overtrades.

---

# 4. Execution engine — `backtest/engine.py`
```
half_cost = (spread_pips/2 + slippage_pips)*pip      # pip=0.01 JPY else 0.0001
entry = open[k] + half_cost (long) | - half_cost (short)
stop  = SMC_ref -/+ 0.1*ATR   else   entry -/+ ATR*atr_mult (1.5)
tp    = entry +/- rr*|entry-stop|   (rr=2.0)
risk_amount   = balance * risk_pct/100
per_unit_loss = |entry-stop| (quote), converted to account ccy (XXX/USD identity; USD/XXX /price)
units         = risk_amount / per_unit_loss
# exit scan from k+1: SL checked BEFORE TP (pessimistic same-bar)
exit_fill = level -/+ half_cost
pnl = quote_to_account(move*units, pair, exit_fill) - commission ; R = pnl/risk_amount
```
Cost decisive: zero-cost +7.38% -> costed +4.94% on the SAME 85 trades.

---

# 5. Risk — `risk/`
position_sizing.calculate_position_size; stops.atr_stop_loss/take_profit;
currency.quote_to_account (P/L -> account ccy; raises on true crosses);
correlation.compute_correlation_matrix/check_correlation_exposure.

---

# 6. Market-context detectors — `market_context/` (causal, tested, chart-verified)
- levels.py: PDH/PDL, PWH/PWL (prior completed period), session H/L (UTC asia 0-8, london 7-16, ny 12-21).
- imbalance.py: FVG bullish low[i]>high[i-2] -> [high[i-2],low[i]]; bearish high[i]<low[i-2]; mitigated when re-entered; inverted (iFVG) when closed through.
- premium_discount.py: dealing range = highest-high/lowest-low over lookback=90; equilibrium=mid; premium pct>0.52 / discount<0.48; OTE 0.62-0.79.
- structure.py: fractal swings (width order); BOS=close beyond last swing; CHoCH=first opposite BOS; trend HH+HL/LH+LL/range.
- liquidity.py: cluster equal highs (buy-side) / lows (sell-side) within tol_pct; swept if later bar exceeds level.
- displacement.py: |C-O|/ATR14 >= 1.5.
- context.py: get_market_context(pair) assembles all across D1/H4/H1.

---

# 7. Why the edge fails (diagnostics)
1. Classification != P&L: a correct 1-bar call wins the 2:1 trade only ~52%;
   corr(1-bar-correct, trade-won)=+0.29; 76% of trades outlive the 1-bar label horizon.
2. Thin edge eaten by costs: pre-cost +0.059R -> post-cost +0.008R (~85% removed).
3. Regime-dependent: accuracy stable, P&L tracks volatility (profits in low-vol folds).
4. Level-to-level = geometric fair (0.292 vs 0.291) -> levels carry zero information.

---

# 8. Validation harness (reusable)
Walk-forward (retrain per fold, trade unseen fold); realistic costs; bootstrap CI +
P(exp<=0); Wilson CI on win rate; fold-consistency (>=4/5 positive); multiple-testing
+ trade-clustering checks.
Scripts: research/{forensics_eurusd, walkforward_eurusd, target_alignment_forensics,
label_trade_alignment, edge_research, edge_level_to_level}.py
Reports: CLAUDE_FINDINGS.md, TARGET_ALIGNMENT_FORENSICS.md, LABEL_TRADE_ALIGNMENT.md.

---

# 9. NOT yet tested (candidate future edges)
- Cross-sectional momentum/carry across many pairs (rank -> long-short basket) — a
  risk premium, needs breadth (~25 pairs) + daily horizon.
- Cointegration mean-reversion (pairs stat-arb) between correlated pairs.
- Event-driven off the economic calendar (needs stored history).
- Non-price information (rates/carry, order-flow/tick, crypto funding/basis).
These are the mathematically-distinct approaches that can survive where single-pair
directional prediction cannot. None validated.
