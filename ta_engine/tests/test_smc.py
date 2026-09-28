import pandas as pd
import pytest

from ta_engine.smc import detect_bos, detect_order_blocks
from ta_engine.support_resistance import compute_sr_zones


def make_df(rows):
    df = pd.DataFrame(rows, columns=["o", "h", "l", "c"])
    df["ts"] = pd.date_range("2026-01-01", periods=len(df), freq="h", tz="UTC")
    return df


def bullish_bos_series():
    rows = [
        (1.000, 1.010, 0.995, 1.005),
        (1.005, 1.012, 1.000, 1.008),
        (1.008, 1.020, 1.005, 1.018),
        (1.018, 1.019, 1.010, 1.012),
        (1.012, 1.014, 1.005, 1.008),
        (1.008, 1.020, 1.006, 1.018),
        (1.018, 1.019, 1.008, 1.010),
        (1.010, 1.035, 1.009, 1.033),
        (1.033, 1.040, 1.030, 1.038),
        (1.038, 1.045, 1.035, 1.042),
    ]
    return make_df(rows)


def bearish_bos_series():
    rows = [
        (1.040, 1.045, 1.030, 1.035),
        (1.035, 1.038, 1.028, 1.030),
        (1.030, 1.032, 1.018, 1.020),
        (1.020, 1.028, 1.019, 1.026),
        (1.026, 1.030, 1.022, 1.028),
        (1.028, 1.030, 1.018, 1.020),
        (1.020, 1.030, 1.019, 1.028),
        (1.028, 1.029, 1.000, 1.002),
        (1.002, 1.005, 0.995, 0.998),
        (0.998, 1.000, 0.990, 0.993),
    ]
    return make_df(rows)


@pytest.mark.parametrize("seed", range(5))
def test_bullish_bos_detected(seed):
    df = bullish_bos_series()
    df.loc[:, ["o", "h", "l", "c"]] += seed * 0.001
    events = detect_bos(df, order=2)
    assert any(e["type"] == "bullish_bos" for e in events)


@pytest.mark.parametrize("seed", range(5))
def test_bearish_bos_detected(seed):
    df = bearish_bos_series()
    df.loc[:, ["o", "h", "l", "c"]] += seed * 0.001
    events = detect_bos(df, order=2)
    assert any(e["type"] == "bearish_bos" for e in events)


def test_bullish_order_block_found():
    df = bullish_bos_series()
    blocks = detect_order_blocks(df, order=2)
    assert any(b["type"] == "bullish_ob" for b in blocks)


def test_bearish_order_block_found():
    df = bearish_bos_series()
    blocks = detect_order_blocks(df, order=2)
    assert any(b["type"] == "bearish_ob" for b in blocks)


def test_no_bos_on_flat_series():
    rows = [(1.000, 1.001, 0.999, 1.000)] * 15
    df = make_df(rows)
    assert detect_bos(df, order=2) == []


def test_sr_zones_shape():
    df = bullish_bos_series()
    zones = compute_sr_zones(df, order=2)
    assert "support" in zones and "resistance" in zones