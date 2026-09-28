import pandas as pd
import pytest

from risk.position_sizing import calculate_position_size
from risk.stops import atr_stop_loss, take_profit, sl_tp_from_atr
from risk.correlation import compute_correlation_matrix, check_correlation_exposure


def test_position_sizing_basic():
    ps = calculate_position_size(balance=10000, risk_pct=1.0, entry=1.1000, stop=1.0950)
    assert ps.risk_amount == 100.0
    assert ps.stop_distance == pytest.approx(0.005)
    assert ps.units == pytest.approx(100.0 / 0.005)


def test_position_sizing_invalid_risk_pct():
    with pytest.raises(ValueError):
        calculate_position_size(10000, 0, 1.10, 1.09)


def test_position_sizing_zero_stop_distance():
    with pytest.raises(ValueError):
        calculate_position_size(10000, 1.0, 1.10, 1.10)


def test_atr_stop_loss_long_short():
    assert atr_stop_loss(1.1000, atr=0.0020, direction="long", atr_mult=1.5) == pytest.approx(1.1000 - 0.0030)
    assert atr_stop_loss(1.1000, atr=0.0020, direction="short", atr_mult=1.5) == pytest.approx(1.1000 + 0.0030)


def test_take_profit_rr():
    tp_long = take_profit(entry=1.1000, stop=1.0950, direction="long", rr=2.0)
    assert tp_long == pytest.approx(1.1000 + 2 * 0.005)
    tp_short = take_profit(entry=1.1000, stop=1.1050, direction="short", rr=2.0)
    assert tp_short == pytest.approx(1.1000 - 2 * 0.005)


def test_sl_tp_from_atr_shape():
    out = sl_tp_from_atr(1.1000, atr=0.0020, direction="long")
    assert set(out.keys()) == {"stop_loss", "take_profit"}
    assert out["stop_loss"] < 1.1000 < out["take_profit"]


def test_correlation_matrix_and_exposure_flagged():
    a = pd.Series([1.10, 1.11, 1.09, 1.12, 1.08, 1.13])
    a_returns = a.pct_change().dropna()
    b = a * 0.9
    c_returns = -a_returns
    c = [1.0]
    for r in c_returns:
        c.append(c[-1] * (1 + r))
    c = pd.Series(c)

    matrix = compute_correlation_matrix({"EUR_USD": a, "GBP_USD": b, "USD_CHF": c})

    warnings = check_correlation_exposure(
        [{"pair": "EUR_USD", "direction": "long"}, {"pair": "GBP_USD", "direction": "long"}],
        matrix, threshold=0.7,
    )
    assert len(warnings) == 1

    warnings2 = check_correlation_exposure(
        [{"pair": "EUR_USD", "direction": "long"}, {"pair": "USD_CHF", "direction": "short"}],
        matrix, threshold=0.7,
    )
    assert len(warnings2) == 1


def test_correlation_exposure_not_flagged_when_uncorrelated():
    a = pd.Series([1.10, 1.101, 1.099, 1.102, 1.098, 1.103])
    b = pd.Series([100.0, 99.5, 100.8, 99.9, 100.3, 99.7])
    matrix = compute_correlation_matrix({"EUR_USD": a, "USD_JPY": b})
    warnings = check_correlation_exposure(
        [{"pair": "EUR_USD", "direction": "long"}, {"pair": "USD_JPY", "direction": "long"}],
        matrix, threshold=0.9,
    )
    assert warnings == []