import pandas as pd
import pytest

from ta_engine.price_action import (
    detect_engulfing, detect_pin_bar, detect_inside_bar, detect_patterns,
)


def candle(o, h, l, c):
    return pd.Series({"o": o, "h": h, "l": l, "c": c})


BULLISH_ENGULFING_CASES = [
    (candle(1.10, 1.101, 1.095, 1.096), candle(1.095, 1.103, 1.094, 1.102)),
    (candle(1.20, 1.202, 1.190, 1.192), candle(1.190, 1.210, 1.189, 1.205)),
    (candle(1.30, 1.301, 1.280, 1.285), candle(1.284, 1.320, 1.283, 1.302)),
    (candle(0.90, 0.905, 0.880, 0.885), candle(0.884, 0.915, 0.883, 0.902)),
    (candle(150.0, 150.2, 148.5, 149.0), candle(148.9, 151.0, 148.8, 150.5)),
    (candle(1.05, 1.052, 1.040, 1.042), candle(1.041, 1.060, 1.040, 1.053)),
    (candle(1.15, 1.151, 1.130, 1.135), candle(1.134, 1.160, 1.133, 1.152)),
    (candle(1.25, 1.252, 1.230, 1.235), candle(1.234, 1.260, 1.233, 1.253)),
    (candle(1.35, 1.352, 1.330, 1.334), candle(1.333, 1.360, 1.332, 1.351)),
    (candle(1.45, 1.452, 1.430, 1.435), candle(1.434, 1.460, 1.433, 1.451)),
]

BEARISH_ENGULFING_CASES = [
    (candle(1.095, 1.103, 1.094, 1.102), candle(1.102, 1.103, 1.093, 1.094)),
    (candle(1.190, 1.210, 1.189, 1.205), candle(1.205, 1.206, 1.188, 1.189)),
    (candle(1.284, 1.320, 1.283, 1.302), candle(1.302, 1.303, 1.282, 1.283)),
    (candle(0.884, 0.915, 0.883, 0.902), candle(0.902, 0.903, 0.882, 0.883)),
    (candle(148.9, 151.0, 148.8, 150.5), candle(150.5, 150.6, 148.7, 148.8)),
    (candle(1.041, 1.060, 1.040, 1.053), candle(1.053, 1.054, 1.039, 1.040)),
    (candle(1.134, 1.160, 1.133, 1.152), candle(1.152, 1.153, 1.132, 1.133)),
    (candle(1.234, 1.260, 1.233, 1.253), candle(1.253, 1.254, 1.232, 1.233)),
    (candle(1.333, 1.360, 1.332, 1.351), candle(1.351, 1.352, 1.331, 1.332)),
    (candle(1.434, 1.460, 1.433, 1.451), candle(1.451, 1.452, 1.432, 1.433)),
]


@pytest.mark.parametrize("prev,curr", BULLISH_ENGULFING_CASES)
def test_bullish_engulfing(prev, curr):
    assert detect_engulfing(prev, curr) == "bullish_engulfing"


@pytest.mark.parametrize("prev,curr", BEARISH_ENGULFING_CASES)
def test_bearish_engulfing(prev, curr):
    assert detect_engulfing(prev, curr) == "bearish_engulfing"


BULLISH_PIN_BAR_CASES = [
    candle(1.088500, 1.090000, 1.080000, 1.089500),
    candle(1.160200, 1.162000, 1.150000, 1.161400),
    candle(1.262750, 1.265000, 1.250000, 1.264250),
    candle(0.887650, 0.889000, 0.880000, 0.888550),
    candle(149.275000, 149.500000, 148.000000, 149.425000),
    candle(1.049350, 1.051000, 1.040000, 1.050450),
    candle(1.141050, 1.143000, 1.130000, 1.142350),
    candle(1.241900, 1.244000, 1.230000, 1.243300),
    candle(1.343600, 1.346000, 1.330000, 1.345200),
    candle(1.444450, 1.447000, 1.430000, 1.446150),
]

BEARISH_PIN_BAR_CASES = [
    candle(1.080500, 1.090000, 1.080000, 1.081500),
    candle(1.150600, 1.162000, 1.150000, 1.151800),
    candle(1.250750, 1.265000, 1.250000, 1.252250),
    candle(0.880450, 0.889000, 0.880000, 0.881350),
    candle(148.075000, 149.500000, 148.000000, 148.225000),
    candle(1.040550, 1.051000, 1.040000, 1.041650),
    candle(1.130650, 1.143000, 1.130000, 1.131950),
    candle(1.230700, 1.244000, 1.230000, 1.232100),
    candle(1.330800, 1.346000, 1.330000, 1.332400),
    candle(1.430850, 1.447000, 1.430000, 1.432550),
]


@pytest.mark.parametrize("row", BULLISH_PIN_BAR_CASES)
def test_bullish_pin_bar(row):
    assert detect_pin_bar(row) == "bullish_pin_bar"


@pytest.mark.parametrize("row", BEARISH_PIN_BAR_CASES)
def test_bearish_pin_bar(row):
    assert detect_pin_bar(row) == "bearish_pin_bar"


INSIDE_BAR_CASES = [
    (candle(1.10, 1.110, 1.090, 1.105), candle(1.104, 1.108, 1.092, 1.100)),
    (candle(1.20, 1.215, 1.185, 1.205), candle(1.204, 1.212, 1.190, 1.200)),
    (candle(1.30, 1.320, 1.280, 1.305), candle(1.304, 1.315, 1.285, 1.300)),
    (candle(0.90, 0.915, 0.885, 0.905), candle(0.904, 0.912, 0.890, 0.900)),
    (candle(150.0, 151.5, 148.5, 150.5), candle(150.4, 151.0, 149.0, 150.2)),
    (candle(1.05, 1.065, 1.035, 1.055), candle(1.054, 1.062, 1.040, 1.050)),
    (candle(1.15, 1.165, 1.135, 1.155), candle(1.154, 1.162, 1.140, 1.150)),
    (candle(1.25, 1.265, 1.235, 1.255), candle(1.254, 1.262, 1.240, 1.250)),
    (candle(1.35, 1.365, 1.335, 1.355), candle(1.354, 1.362, 1.340, 1.350)),
    (candle(1.45, 1.465, 1.435, 1.455), candle(1.454, 1.462, 1.440, 1.450)),
]


@pytest.mark.parametrize("prev,curr", INSIDE_BAR_CASES)
def test_inside_bar(prev, curr):
    assert detect_inside_bar(prev, curr) == "inside_bar"


def test_detect_patterns_end_to_end():
    rows = [BULLISH_ENGULFING_CASES[0][0], BULLISH_ENGULFING_CASES[0][1]]
    df = pd.DataFrame(rows)
    df["ts"] = pd.date_range("2026-01-01", periods=len(df), freq="h", tz="UTC")
    patterns = detect_patterns(df)
    assert any(p["pattern"] == "bullish_engulfing" for p in patterns)


def test_no_pattern_on_flat_candles():
    row = candle(1.10, 1.1005, 1.0995, 1.1002)
    assert detect_pin_bar(row) is None