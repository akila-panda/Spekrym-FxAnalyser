"""V1.5 smoke: fade flips the ORB direction; session momentum enters with the
early-session move. Synthetic; no DB."""
import pandas as pd

from market_context.orb_strategy import make_orb_strategy
from market_context.momentum_strategy import make_session_momentum_strategy

PIP = 0.0001


class Ctx:
    def __init__(self, m1):
        self.m1 = m1
        self.price = float(m1["c"].iloc[-1])


def _bars(end_min, last_c, mom_up=None):
    """06:40..(07:00+end_min). Range 07:00–07:15 = 1.1020/1.0990. If mom_up set,
    the whole post-open path drifts that way for the momentum test."""
    rows = []
    start = pd.Timestamp("2024-01-02 06:40", tz="UTC")
    for i in range(20 + end_min + 1):
        ts = start + pd.Timedelta(minutes=i)
        mid = 1.1000
        h, l = mid + PIP, mid - PIP
        if pd.Timestamp("2024-01-02 07:00", tz="UTC") <= ts < pd.Timestamp("2024-01-02 07:15", tz="UTC"):
            h, l = 1.1020, 1.0990
        o = c = mid
        if mom_up is not None and ts >= pd.Timestamp("2024-01-02 07:20", tz="UTC"):
            o = c = h = l = mom_up      # drift up AFTER the open (open stays 1.1000)
        rows.append({"ts": ts, "o": o, "h": h, "l": l, "c": c, "v": 100})
    rows[-1]["c"] = last_c
    rows[-1]["h"] = max(rows[-1]["h"], last_c)
    rows[-1]["l"] = min(rows[-1]["l"], last_c)
    return pd.DataFrame(rows)


def test_fade_flips_breakout_direction():
    df = _bars(20, last_c=1.1025)              # breaks UP → breakout long, fade short
    bo = make_orb_strategy({"mode": "breakout"})(Ctx(df))
    fd = make_orb_strategy({"mode": "fade"})(Ctx(df))
    assert bo["direction"] == "long" and fd["direction"] == "short"


def test_momentum_follows_early_move_up():
    # session opened at 1.1000, now up at 1.1030 after 70 min → long
    df = _bars(70, last_c=1.1030, mom_up=1.1030)
    sig = make_session_momentum_strategy({"signal_min": 60})(Ctx(df))
    assert sig and sig["direction"] == "long"
