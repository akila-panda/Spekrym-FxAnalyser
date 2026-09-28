"""Backtest the multi-agent Strategy Coordinator on EUR_USD's out-of-sample
holdout -- the same window backtest/run_forecast.py uses -- so the coordinator
and the raw-forecast strategy are directly comparable.

Run: python -m backtest.run_coordinator
"""
import asyncio
import logging

from backtest.engine import run_backtest
from backtest.report import build_report, write_json_report, write_markdown_report
from backtest.strategies.coordinator_signal import make_strategy
from forecast.train import HOLDOUT_FRACTION
from ta_engine.loader import load_candles

logger = logging.getLogger("run_coordinator")

PAIR = "EUR_USD"
TIMEFRAME = "H1"
CANDLE_LIMIT = 15000
WARMUP = 260


async def main():
    df = await load_candles(PAIR, TIMEFRAME, limit=CANDLE_LIMIT)

    holdout_start = int(len(df) * (1 - HOLDOUT_FRACTION))
    window_start = max(0, holdout_start - WARMUP)
    df_eval = df.iloc[window_start:].reset_index(drop=True)
    first_tradeable_index = holdout_start - window_start

    logger.info("holdout window: %d candles (%d warmup + %d out-of-sample), "
                "trading begins at index %d",
                len(df_eval), first_tradeable_index,
                len(df_eval) - first_tradeable_index, first_tradeable_index)

    strategy_fn = make_strategy(PAIR, TIMEFRAME, horizon=1)

    # risk_pct here is the fallback; the coordinator overrides per-signal with
    # confidence-scaled sizing, so leave the default in place.
    result = run_backtest(df_eval, strategy_fn, initial_balance=10_000.0,
                          risk_pct=1.0, window=first_tradeable_index, pair=PAIR,
                          spread_pips=0.6, slippage_pips=0.1)
    report = build_report(result, PAIR, TIMEFRAME)
    report["strategy"] = "multi_agent_coordinator_h1"
    report["candle_count"] = len(df_eval)
    report["note"] = ("coordinator (forecast + price-action + volatility gating + "
                      "confidence-scaled sizing) on the model's out-of-sample "
                      "holdout only; cross/sentiment/calendar agents abstain in "
                      "single-pair backtest")

    write_json_report(report, "backtest/results/coordinator_eurusd_h1.json")
    write_markdown_report(report, "backtest/results/coordinator_eurusd_h1.md")
    logger.info("trades=%d win_rate=%.1f%% max_dd=%.2f%% return=%.2f%%",
                report["total_trades"], report["win_rate"] * 100,
                report["max_drawdown_pct"], report["total_return_pct"])


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(main())
