import pandas as pd
import pytest

from backtest.engine import run_backtest
from backtest.strategies.order_block_reclaim import generate_signal


def build_price_series(n=400, seed=7):
    import numpy as np
    rng = np.random.default_rng(seed)
    vol = 0.0004
    closes = 1.1000 + np.cumsum(rng.normal(0, vol, n))
    o = closes - rng.normal(0, vol / 3, n)
    h = np.maximum(o, closes) + np.abs(rng.normal(0, vol, n))
    l = np.minimum(o, closes) - np.abs(rng.normal(0, vol, n))
    df = pd.DataFrame({"o": o, "h": h, "l": l, "c": closes, "v": 1000})
    df["ts"] = pd.date_range("2026-01-01", periods=n, freq="h", tz="UTC")
    return df


def always_none_strategy(window_df):
    return None


def test_no_signal_produces_no_trades():
    df = build_price_series()
    result = run_backtest(df, always_none_strategy, window=50)
    assert result.trades == []
    assert result.final_balance == result.initial_balance


def test_forced_long_signal_hits_tp_or_sl():
    df = build_price_series()

    def always_long(window_df):
        last = window_df.iloc[-1]
        return {"direction": "long", "reference_low": last["l"] - 0.001, "reason": "forced"}

    result = run_backtest(df, always_long, window=50)
    assert len(result.trades) >= 1
    for t in result.trades:
        assert t.exit_reason in ("stop_loss", "take_profit")
        assert t.pnl is not None


def test_balance_updates_consistently_with_trade_pnls():
    df = build_price_series()

    def always_long(window_df):
        last = window_df.iloc[-1]
        return {"direction": "long", "reference_low": last["l"] - 0.001, "reason": "forced"}

    result = run_backtest(df, always_long, window=50, initial_balance=5000)
    expected_balance = 5000 + sum(t.pnl for t in result.trades)
    assert result.final_balance == pytest.approx(expected_balance)


def test_only_one_open_position_at_a_time():
    df = build_price_series(n=600)

    def always_long(window_df):
        last = window_df.iloc[-1]
        return {"direction": "long", "reference_low": last["l"] - 0.001, "reason": "forced"}

    result = run_backtest(df, always_long, window=50)
    entries = sorted(t.entry_index for t in result.trades)
    exits = sorted(t.exit_index for t in result.trades)
    for entry_idx, exit_idx in zip(entries[1:], exits[:-1]):
        assert entry_idx > exit_idx


def test_order_block_reclaim_strategy_runs_without_error():
    df = build_price_series(n=500)
    result = run_backtest(df, generate_signal, window=100)
    assert result.final_balance >= 0