"""Tests for FVG/iFVG detection and premium/discount."""
import numpy as np
import pandas as pd

from market_context.imbalance import detect_fvgs, active_fvgs, inverted_fvgs
from market_context.premium_discount import premium_discount


def _df(closes, spread=0.0005, start="2026-09-21 00:00"):
    c = np.array(closes, dtype=float)
    ts = pd.date_range(start, periods=len(c), freq="h", tz="UTC")
    return pd.DataFrame({"ts": ts, "o": c, "h": c + spread, "l": c - spread, "c": c, "v": 1000})


def _bullish_fvg_df():
    ts = pd.date_range("2026-09-21", periods=3, freq="h", tz="UTC")
    return pd.DataFrame({
        "ts": ts,
        "o": [1.1000, 1.0995, 1.1025],
        "h": [1.1000, 1.1030, 1.1040],
        "l": [1.0990, 1.0995, 1.1010],   # l[2]=1.1010 > h[0]=1.1000 -> bullish FVG
        "c": [1.0995, 1.1025, 1.1035],
        "v": [1000, 1000, 1000],
    })


def test_detects_bullish_fvg():
    fvgs = detect_fvgs(_bullish_fvg_df())
    assert len(fvgs) == 1
    f = fvgs[0]
    assert f["type"] == "bullish"
    assert f["bottom"] == 1.1000 and f["top"] == 1.1010
    assert not f["mitigated"] and not f["inverted"]
    assert len(active_fvgs(_bullish_fvg_df())) == 1


def test_fvg_mitigated_then_active_false():
    df = _bullish_fvg_df()
    extra = pd.DataFrame({"ts": [df["ts"].iloc[-1] + pd.Timedelta(hours=1)],
                          "o": [1.1030], "h": [1.1035], "l": [1.1005], "c": [1.1020], "v": [1000]})
    df2 = pd.concat([df, extra], ignore_index=True)
    f = detect_fvgs(df2)[0]
    assert f["mitigated"] is True
    assert len(active_fvgs(df2)) == 0


def test_fvg_inverts_to_ifvg():
    df = _bullish_fvg_df()
    extra = pd.DataFrame({"ts": [df["ts"].iloc[-1] + pd.Timedelta(hours=1)],
                          "o": [1.1010], "h": [1.1015], "l": [1.0980], "c": [1.0990], "v": [1000]})
    df2 = pd.concat([df, extra], ignore_index=True)
    f = detect_fvgs(df2)[0]
    assert f["inverted"] is True
    assert len(inverted_fvgs(df2)) == 1


def test_premium_discount_zone():
    closes = [1.10, 1.10, 1.10, 1.09, 1.095, 1.10, 1.105, 1.11, 1.115,
              1.12, 1.115, 1.11, 1.105, 1.10, 1.095]
    pd_ = premium_discount(_df(closes))
    assert pd_ is not None
    assert pd_["range_high"] > pd_["range_low"]
    assert pd_["zone"] == "discount"          # last price near the low of the range
    assert 0.0 <= pd_["pct_of_range"] <= 1.0


def test_premium_discount_none_when_tiny():
    assert premium_discount(_df([1.10, 1.10])) is None
