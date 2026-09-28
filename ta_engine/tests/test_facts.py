import numpy as np
import pandas as pd
import pytest

from ta_engine.facts import build_facts


def make_trending_df(n=250, start=1.0500, drift=0.00005, noise=0.0003, seed=1):
    rng = np.random.default_rng(seed)
    closes = start + np.cumsum(rng.normal(drift, noise, n))
    o = closes - rng.normal(0, noise / 2, n)
    h = np.maximum(o, closes) + np.abs(rng.normal(0, noise, n))
    l = np.minimum(o, closes) - np.abs(rng.normal(0, noise, n))
    df = pd.DataFrame({"o": o, "h": h, "l": l, "c": closes, "v": rng.integers(100, 1000, n)})
    df["ts"] = pd.date_range("2026-01-01", periods=n, freq="h", tz="UTC")
    return df


def test_build_facts_full_shape():
    df = make_trending_df()
    facts = build_facts("EUR_USD", "H1", df)
    assert facts["pair"] == "EUR_USD"
    assert facts["timeframe"] == "H1"
    assert "indicators" in facts and "ma" in facts["indicators"]
    assert "price_action" in facts
    assert "support_resistance" in facts
    assert "smc" in facts and "break_of_structure" in facts["smc"]


def test_build_facts_insufficient_data():
    df = make_trending_df(n=10)
    facts = build_facts("EUR_USD", "H1", df)
    assert facts["indicators"]["error"] == "insufficient_data"


def test_build_facts_no_data():
    df = pd.DataFrame(columns=["ts", "o", "h", "l", "c", "v"])
    facts = build_facts("EUR_USD", "H1", df)
    assert facts["error"] == "no_data"


@pytest.mark.parametrize("tf", ["H1", "H4", "D1"])
def test_build_facts_all_timeframes(tf):
    df = make_trending_df()
    facts = build_facts("GBP_USD", tf, df)
    assert facts["timeframe"] == tf
    assert facts["candle_count"] == len(df)