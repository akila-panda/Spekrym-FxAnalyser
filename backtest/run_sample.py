"""Runs the sample 'bullish order block reclaim' strategy through the backtest
engine over ~1 year of H1 data and writes a report to backtest/results/.

Tries real ingested candles first (Phase 0 DB); falls back to a synthetic,
seeded random-walk series (clearly labeled in the report) so this script is
runnable standalone without live infrastructure.
"""
import asyncio
import logging

import numpy as np
import pandas as pd

from backtest.engine import run_backtest
from backtest.report import build_report, write_json_report, write_markdown_report
from backtest.strategies.order_block_reclaim import generate_signal

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("run_sample")

PAIR = "EUR_USD"
TIMEFRAME = "H1"
HOURS_PER_YEAR = 365 * 24


def synthetic_h1_series(n: int = HOURS_PER_YEAR, start: float = 1.0800, seed: int = 42) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    vol = 0.00035 + 0.0002 * np.abs(np.sin(np.linspace(0, 40, n)))
    steps = rng.normal(0, 1, n) * vol
    closes = start + np.cumsum(steps)

    o = np.empty(n)
    o[0] = start
    o[1:] = closes[:-1]
    h = np.maximum(o, closes) + np.abs(rng.normal(0, vol / 2, n))
    l = np.minimum(o, closes) - np.abs(rng.normal(0, vol / 2, n))
    v = rng.integers(500, 5000, n)

    df = pd.DataFrame({"o": o, "h": h, "l": l, "c": closes, "v": v})
    df["ts"] = pd.date_range("2025-09-22", periods=n, freq="h", tz="UTC")
    return df


async def load_real_data() -> pd.DataFrame | None:
    try:
        from ta_engine.loader import load_candles
        df = await load_candles(PAIR, TIMEFRAME, limit=HOURS_PER_YEAR)
        return df if not df.empty and len(df) >= HOURS_PER_YEAR // 2 else None
    except Exception as e:
        logger.warning("real data unavailable (%s), falling back to synthetic", e)
        return None


async def main():
    df = await load_real_data()
    data_source = "live_db"
    if df is None:
        df = synthetic_h1_series()
        data_source = "synthetic_seeded_random_walk"

    logger.info("running backtest on %d candles (source=%s)", len(df), data_source)
    result = run_backtest(df, generate_signal, initial_balance=10_000.0, risk_pct=1.0, window=200, pair=PAIR)

    report = build_report(result, PAIR, TIMEFRAME)
    report["data_source"] = data_source
    report["candle_count"] = len(df)

    write_json_report(report, "backtest/results/sample_eurusd_h1.json")
    write_markdown_report(report, "backtest/results/sample_eurusd_h1.md")
    logger.info("trades=%d win_rate=%.1f%% max_dd=%.2f%% return=%.2f%%",
                report["total_trades"], report["win_rate"] * 100,
                report["max_drawdown_pct"], report["total_return_pct"])


if __name__ == "__main__":
    asyncio.run(main())