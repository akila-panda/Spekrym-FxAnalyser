"""Runs the forecast-driven strategy through the Phase 2 backtest engine,
restricted to the out-of-sample holdout period only.

IMPORTANT: forecast.train saves a single model trained on the first
(1 - HOLDOUT_FRACTION) of history and evaluates it on the trailing holdout.
Backtesting across the *full* candle history (as an earlier version of this
script did) mixes trades over data the model was trained on with genuine
out-of-sample trades -- that inflates results and is not a fair test. This
version slices to the same trailing holdout window train.py used, so every
trade here is on data the model never saw during fitting.
"""
import asyncio
import logging

from backtest.engine import run_backtest
from backtest.report import build_report, write_json_report, write_markdown_report
from backtest.strategies.forecast_signal import make_strategy
from forecast.train import HOLDOUT_FRACTION
from ta_engine.loader import load_candles

logger = logging.getLogger("run_forecast")

PAIR = "EUR_USD"
TIMEFRAME = "H1"
CANDLE_LIMIT = 15000
WARMUP = 260  # must match the strategy's MIN_CANDLES so the engine has
              # enough causal history to compute features on the first
              # holdout candle


async def main():
    df = await load_candles(PAIR, TIMEFRAME, limit=CANDLE_LIMIT)

    holdout_start = int(len(df) * (1 - HOLDOUT_FRACTION))
    # keep WARMUP candles of pre-holdout history so the engine's rolling
    # window has enough data to compute features right at the holdout's
    # first candle, without ever *trading* on pre-holdout bars
    window_start = max(0, holdout_start - WARMUP)
    df_eval = df.iloc[window_start:].reset_index(drop=True)
    first_tradeable_index = holdout_start - window_start

    logger.info("holdout window: %d candles (%d warmup + %d out-of-sample), "
                "trading begins at index %d",
                len(df_eval), first_tradeable_index,
                len(df_eval) - first_tradeable_index, first_tradeable_index)

    strategy_fn = make_strategy(PAIR, TIMEFRAME, horizon=1)

    result = run_backtest(df_eval, strategy_fn, initial_balance=10_000.0,
                           risk_pct=1.0, window=first_tradeable_index, pair=PAIR,
                           spread_pips=0.6, slippage_pips=0.1)
    report = build_report(result, PAIR, TIMEFRAME)
    report["strategy"] = "forecast_model_h1"
    report["candle_count"] = len(df_eval)
    report["note"] = ("backtest restricted to the model's out-of-sample "
                       "holdout window only -- see forecast.train.HOLDOUT_FRACTION")

    write_json_report(report, "backtest/results/forecast_eurusd_h1.json")
    write_markdown_report(report, "backtest/results/forecast_eurusd_h1.md")
    logger.info("trades=%d win_rate=%.1f%% max_dd=%.2f%% return=%.2f%%",
                report["total_trades"], report["win_rate"] * 100,
                report["max_drawdown_pct"], report["total_return_pct"])


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(main())