"""Tests for account-currency conversion in sizing and P/L (USD account).

The bug this guards against: a USD_JPY price move is in JPY, so treating it as
USD makes position sizes and P/L ~100x wrong. EUR_USD (quote == account) must
stay exactly as before.
"""
import numpy as np
import pandas as pd
import pytest

from risk.currency import split_pair, quote_to_account
from risk.position_sizing import calculate_position_size
from backtest.engine import run_backtest


# --- quote_to_account ------------------------------------------------------

def test_split_pair():
    assert split_pair("EUR_USD") == ("EUR", "USD")
    assert split_pair("USD/JPY") == ("USD", "JPY")


def test_quote_to_account_identity_when_quote_is_account():
    # EUR_USD quote is USD -> no conversion
    assert quote_to_account(123.0, "EUR_USD", price=1.10, account_ccy="USD") == 123.0


def test_quote_to_account_divides_for_base_account_pair():
    # USD_JPY: amount is in JPY, USD = JPY / price
    assert quote_to_account(150.0, "USD_JPY", price=150.0, account_ccy="USD") == pytest.approx(1.0)


def test_quote_to_account_raises_on_cross():
    with pytest.raises(NotImplementedError):
        quote_to_account(10.0, "EUR_GBP", price=0.85, account_ccy="USD")


# --- position sizing across pair conventions -------------------------------

def test_sizing_unchanged_for_xxx_usd():
    with_pair = calculate_position_size(10000, 1.0, 1.1000, 1.0950, pair="EUR_USD")
    legacy = calculate_position_size(10000, 1.0, 1.1000, 1.0950)  # pair=None
    assert with_pair.units == pytest.approx(legacy.units)
    assert with_pair.units == pytest.approx(100.0 / 0.005)


def test_sizing_converts_for_usd_jpy():
    # risk 100 USD; stop distance 0.50 JPY at entry 150.00
    ps = calculate_position_size(10000, 1.0, 150.00, 149.50, pair="USD_JPY")
    # per-unit loss in USD = 0.50 / 150.00; units = 100 / that
    assert ps.units == pytest.approx(100.0 / (0.50 / 150.00))
    # a naive (wrong) sizing would be 100 / 0.50 = 200 units -- ~300x smaller
    assert ps.units > 100 * 200  # sanity: far larger than the un-converted size


# --- engine P/L conversion -------------------------------------------------

def _jpy_series(n=120, seed=3):
    rng = np.random.default_rng(seed)
    closes = 150.0 + np.cumsum(rng.normal(0, 0.05, n))
    o = closes - rng.normal(0, 0.02, n)
    h = np.maximum(o, closes) + np.abs(rng.normal(0, 0.05, n))
    l = np.minimum(o, closes) - np.abs(rng.normal(0, 0.05, n))
    df = pd.DataFrame({"o": o, "h": h, "l": l, "c": closes, "v": 1000})
    df["ts"] = pd.date_range("2026-01-01", periods=n, freq="h", tz="UTC")
    return df


def _forced_long(window_df):
    last = window_df.iloc[-1]
    return {"direction": "long", "reference_low": last["l"] - 0.10, "reason": "forced"}


def test_engine_converts_pnl_for_usd_jpy():
    df = _jpy_series()
    converted = run_backtest(df, _forced_long, window=30, pair="USD_JPY")
    raw = run_backtest(df, _forced_long, window=30)  # pair=None: JPY treated as USD

    assert len(converted.trades) >= 1
    assert len(converted.trades) == len(raw.trades)

    # R-multiples are normalized so they stay close to the un-converted case,
    # but not identical: sizing converts at the entry rate while P/L realizes
    # at the exit rate, so a real move in USD/JPY between entry and stop shifts
    # the realized R slightly off the nominal target (a genuine FX effect).
    for c, r in zip(converted.trades, raw.trades):
        assert c.r_multiple == pytest.approx(r.r_multiple, rel=0.05)

    # Where the fix actually bites is POSITION SIZE. On a USD account a JPY
    # move is worth ~1/price as much in USD, so a correctly-converted USD_JPY
    # trade must hold ~price-times MORE units to risk the same 1%. Without
    # conversion the trade is sized ~150x too small -- a live order that would
    # under-risk badly and break any cross-pair P/L aggregation.
    c0, r0 = converted.trades[0], raw.trades[0]
    assert c0.units > r0.units * 100
    # and the converted trade really does risk ~1R in account terms
    assert c0.r_multiple == pytest.approx(-1.0, rel=0.05)
