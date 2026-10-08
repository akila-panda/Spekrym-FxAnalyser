"""Phase B acceptance + gate tests for the scalping engine."""
import numpy as np
import pandas as pd

from backtest.scalp_engine import run_scalp_backtest, summarize

PIP = 0.0001


def make_m1(mids, spread_pips=1.6, start="2026-09-21 08:00"):
    """Flat OHLC bars at `mids` with a constant bid/ask spread (London session)."""
    c = np.array(mids, dtype=float)
    half = spread_pips * PIP / 2
    ts = pd.date_range(start, periods=len(c), freq="min", tz="UTC")
    return pd.DataFrame({
        "ts": ts, "o": c, "h": c, "l": c, "c": c, "v": 100,
        "bid_o": c - half, "bid_h": c - half, "bid_l": c - half, "bid_c": c - half,
        "ask_o": c + half, "ask_h": c + half, "ask_l": c + half, "ask_c": c + half,
    })


def always_long(ctx):
    return {"direction": "long"}


def test_acceptance_flat_market_nets_minus_spread():
    # constant price -> every long times out at the bid = pays exactly the spread
    df = make_m1([1.1000] * 60, spread_pips=1.6)
    res = run_scalp_backtest(df, always_long, "EUR_USD", tp_pips=5, sl_pips=5,
                             max_hold_min=3, max_spread_pips=2.0)
    s = summarize(res)
    assert s["n"] > 0
    assert s["exit_mix"]["time"] == s["n"]           # all timed out (flat)
    assert -1.9 < s["avg_net_pips"] < -1.3           # ~= -1.6 spread


def test_session_gate_blocks_off_session():
    df = make_m1([1.1000] * 60, start="2026-09-21 02:00")  # 02:00 UTC = off-session
    res = run_scalp_backtest(df, always_long, "EUR_USD", max_hold_min=3)
    assert len(res.trades) == 0


def test_spread_gate_blocks_wide_spread():
    df = make_m1([1.1000] * 60, spread_pips=3.0)            # 3 pip > default max 1.5
    res = run_scalp_backtest(df, always_long, "EUR_USD", max_spread_pips=1.5, max_hold_min=3)
    assert len(res.trades) == 0


def test_winning_long_hits_tp_net_of_spread():
    # ramp price up so a long TP (5 pips, plus 2*half spread) is reached
    mids = [1.1000 + i * 0.0002 for i in range(30)]         # +2 pip/bar
    df = make_m1(mids, spread_pips=1.0)
    res = run_scalp_backtest(df, always_long, "EUR_USD", tp_pips=5, sl_pips=5,
                             max_hold_min=60, max_spread_pips=2.0)
    assert any(t.exit_reason == "tp" for t in res.trades)
    tp_trade = next(t for t in res.trades if t.exit_reason == "tp")
    assert tp_trade.net_pips > 0
    assert tp_trade.pnl_usd > 0


def test_time_stop_closes_position():
    df = make_m1([1.1000] * 30, spread_pips=1.0)
    res = run_scalp_backtest(df, always_long, "EUR_USD", tp_pips=50, sl_pips=50,
                             max_hold_min=5, max_spread_pips=2.0)
    assert all(t.exit_reason == "time" for t in res.trades)
    assert all(t.hold_min >= 5 for t in res.trades)
