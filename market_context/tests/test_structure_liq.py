"""Tests for market structure (trend/BOS/CHoCH) and liquidity pools."""
import numpy as np
import pandas as pd

from market_context.structure import market_structure
from market_context.liquidity import liquidity_pools


def _df(vals, spread=0.1):
    c = np.array(vals, dtype=float)
    ts = pd.date_range("2026-09-21", periods=len(c), freq="h", tz="UTC")
    return pd.DataFrame({"ts": ts, "o": c, "h": c + spread, "l": c - spread, "c": c, "v": 1000})


# zigzag with higher highs (12,15,18) and higher lows (10.5,13.5) -> bullish
_UP = [10, 11, 12, 11, 10.5, 13, 14, 15, 14, 13.5, 16, 17, 18, 17, 16.5]


def test_trend_bullish():
    ms = market_structure(_df(_UP), order=2)
    assert ms["trend"] == "bullish"
    assert ms["last_swing_high"] is not None and ms["last_swing_low"] is not None


def test_trend_bearish():
    ms = market_structure(_df(list(reversed(_UP))), order=2)
    assert ms["trend"] == "bearish"


def test_structure_keys_present():
    ms = market_structure(_df(_UP), order=2)
    for k in ("trend", "last_swing_high", "last_swing_low", "last_event", "events", "n_swings"):
        assert k in ms


def test_liquidity_equal_highs_pool_and_sweep():
    # two swing highs at ~equal level (12.00, 12.05) = buy-side liquidity
    base = [11, 11, 12.00, 11, 11, 12.05, 11, 11]
    df = _df(base, spread=0.0)
    pools = liquidity_pools(df, order=2, tol_pct=0.01, lookback=None, min_touches=2)
    assert len(pools["buy_side"]) == 1
    assert pools["buy_side"][0]["touches"] == 2
    assert pools["buy_side"][0]["swept"] is False

    # append a candle that trades above the pool -> swept
    swept = base + [11, 12.20]
    df2 = _df(swept, spread=0.0)
    pools2 = liquidity_pools(df2, order=2, tol_pct=0.01, lookback=None, min_touches=2)
    assert pools2["buy_side"] and pools2["buy_side"][0]["swept"] is True
