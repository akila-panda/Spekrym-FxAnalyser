"""Phase C strategy gate tests (pure, no DB)."""
from types import SimpleNamespace

import numpy as np
import pandas as pd

from market_context.scalp_strategy import (
    _location_ok, _nearest_zone, _m1_trigger, make_scalp_strategy,
)


def _m1_disp_up(n=60, base=1.10):
    c = np.full(n, base)
    df = pd.DataFrame({"ts": pd.date_range("2026-09-21 09:00", periods=n, freq="min", tz="UTC"),
                       "o": c, "h": c + 0.0002, "l": c - 0.0002, "c": c, "v": 100})
    df.loc[df.index[-1], ["o", "l"]] = [base, base - 0.0002]
    df.loc[df.index[-1], ["c", "h"]] = [base + 0.0030, base + 0.0032]  # big up displacement
    return df


def test_location_gate():
    assert _location_ok("discount", "long") is True
    assert _location_ok("premium", "long") is False
    assert _location_ok("premium", "short") is True
    assert _location_ok(None, "long") is True


def test_nearest_zone_in_range():
    zones = [{"type": "fvg", "top": 1.1005, "bottom": 1.1000}]
    assert _nearest_zone(zones, price=1.1003, atr=0.0005) is not None
    assert _nearest_zone(zones, price=1.2000, atr=0.0005) is None
    assert _nearest_zone([], 1.10, 0.0005) is None


def test_m1_trigger_displacement_long():
    df = _m1_disp_up()
    assert _m1_trigger(df, "long", {"disp_mult": 1.3, "trigger": "disp"}) is True
    assert _m1_trigger(df, "short", {"disp_mult": 1.3, "trigger": "disp"}) is False


def test_strategy_end_to_end_signal():
    strat = make_scalp_strategy({"trigger": "disp"})
    ctx = SimpleNamespace(
        price=1.1002, m1=_m1_disp_up(),
        htf={"bias": "long", "pd_zone": "discount", "atr_m5": 0.0005,
             "zones": [{"type": "fvg", "top": 1.1005, "bottom": 1.1000}]})
    sig = strat(ctx)
    assert sig is not None and sig["direction"] == "long"


def test_strategy_blocks_counter_trend_location():
    strat = make_scalp_strategy({"trigger": "disp"})
    ctx = SimpleNamespace(
        price=1.1002, m1=_m1_disp_up(),
        htf={"bias": "long", "pd_zone": "premium", "atr_m5": 0.0005,
             "zones": [{"type": "fvg", "top": 1.1005, "bottom": 1.1000}]})
    assert strat(ctx) is None


def test_strategy_no_bias_no_trade():
    strat = make_scalp_strategy()
    ctx = SimpleNamespace(price=1.10, m1=_m1_disp_up(), htf={"bias": None})
    assert strat(ctx) is None
