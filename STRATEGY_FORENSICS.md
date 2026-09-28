# STRATEGY_FORENSICS.md

Full pipeline trace for the Spekrym-FX system, mapping every stage to the file
that owns it, with the causal (knowable-at-entry) status of each. Written
before any strategy modification, as a forensic baseline.

## Pipeline map

| # | Stage | File(s) | Notes / causal status |
|---|---|---|---|
| 1 | Data source | `data/oanda_client.py` | OANDA v3 candles, **mid prices** (`price="M"`). Circuit breaker + retry. |
| 2 | Storage | `data/migrations/001_init.sql`, `002_hypertable.sql`, `data/db.py` | TimescaleDB hypertable `candles(pair,ts,o,h,l,c,v,complete)`. |
| 3 | Ingestion | `data/fetch_ohlcv.py` | 2y backfill + poll; stores `complete` flag; upsert. |
| 4 | Calendar | `data/fetch_calendar.py` | ForexFactory this-week feed only; **next-week 404s** (no history stored). |
| 5 | Loading | `ta_engine/loader.py` | `load_candles` orders `ts DESC LIMIT n` then reverses; filters `complete=TRUE`. |
| 6 | Resampling | `ta_engine/loader.py` | H4/D1 resampled from H1 via pandas `resample`. **Calendar-aligned bins** (00:00 UTC), not broker/NY session — a known approximation. |
| 7 | Feature engineering | `forecast/features.py` | 19 features, all `pct_change`/rolling **backward-looking**; label = forward return over `horizon`, ATR-thresholded. |
| 8 | Indicators (facts) | `ta_engine/indicators.py` | latest-snapshot RSI/MACD/BB/ATR/SMA/EMA. |
| 9 | Structure / swings | `ta_engine/support_resistance.py` | fractal swings (vectorized), **usable only `order` bars after they form** (see BOS). |
| 10 | SMC (BOS, OB) | `ta_engine/smc.py` | BOS = close beyond last confirmed swing; OB = last opposite candle before BOS. |
| 11 | Facts aggregation | `ta_engine/facts.py` | `build_facts()` → JSON of indicators+PA+SR+SMC. |
| 12 | Forecast model | `forecast/model.py`, `train.py`, `predict.py` | HistGradientBoosting 3-class; trained on first 80%, holdout last 20%; versioned. |
| 13 | Signal (raw) | `backtest/strategies/forecast_signal.py`, `order_block_reclaim.py` | forecast: trade predicted class if confidence ≥ 0.45. |
| 14 | Coordinator | `agents/coordinator.py` + `agents/*_tree.py` | weighs 3 trees, gates, confidence-scaled size. |
| 15 | Entry | `backtest/engine.py` | signal from window ending at k-1; **fill at candle k open** (causal). |
| 16 | Position / SL / TP | `backtest/engine.py`, `risk/stops.py` | ATR or SMC-reference stop; TP at RR×risk. |
| 17 | Execution / costs | `backtest/engine.py` | spread+slippage cross on entry & exit (runner-set 0.6/0.1); commission optional. |
| 18 | P&L | `backtest/engine.py` | quote→account conversion (`risk/currency.py`); per-signal risk %. |
| 19 | Equity / drawdown | `backtest/report.py` | peak-to-trough on realized equity curve (per-trade points only). |
| 20 | Reporting | `backtest/report.py`, `run_*.py` | JSON + Markdown. |

## Causal-integrity notes (pre-audit, from code reading)

- **Entry is causal:** `run_backtest` computes the signal from `df.iloc[k-1-window:k]` (up to k-1) and fills at `row=df.iloc[k]` open. No same-bar signal+fill.
- **Features are backward-looking:** `build_feature_frame` uses only `pct_change`/rolling; labels use `shift(-horizon)` and the last `horizon` rows are dropped (`build_dataset`). No obvious feature/label leak.
- **Train/test split is chronological:** `_time_split` (no shuffle); backtest holdout = last 20%, model trained on first 80% → **no overlap** as long as the DB row set is identical between `train` and backtest (both `limit=15000`, same day). To be verified in reconciliation.
- **Swings have a formation delay** built into BOS logic, but `find_swing_points` marks a swing at its center index; any consumer that treats a swing as known *at* its center bar rather than `order` bars later would be mildly anticipatory. To be checked in the integrity audit for the SMC path (not used by the forecast strategy).
- **Equity curve granularity:** drawdown is computed only at trade-close points, so intratrade drawdown is understated. Flag.
- **Data is mid-price:** all fills modeled from mid ± modeled spread; real bid/ask microstructure not present. Flag for execution realism.
- **Intrabar ambiguity:** if a bar spans both SL and TP, the engine checks SL first → counts a **loss** (pessimistic/conservative). Good.
- **Entry-bar stop not re-checked:** exits are scanned from k+1 onward; a stop that would trigger on the entry bar itself is missed → mildly optimistic. Flag.

## What the forecast strategy actually uses

The candidate edge (`forecast_signal`) uses **only** the ML probability. It does
**not** use order blocks, FVGs, or liquidity sweeps. Therefore SMC-forensics
(OB/FVG identity, sweep edge) are relevant to the *coordinator*, not to the
forecast edge under test. Prior evidence (`CCode/sweep-backtest`) already found
SMC/price-action carried no standalone edge.
