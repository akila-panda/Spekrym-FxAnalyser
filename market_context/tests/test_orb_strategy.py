"""V1.1/V1.2 gate: opening range uses only in-window bars (no look-ahead), and
the ORB strategy fires on a genuine breakout with session-sized targets and
respects its filters. Synthetic; no DB."""
import pandas as pd

from market_context.orb_strategy import opening_range, make_orb_strategy

PIP = 0.0001


class Ctx:
    def __init__(self, m1):
        self.m1 = m1
        self.price = float(m1["c"].iloc[-1])


def _bars(end_min, last_c=None, last_v=100):
    """Minute bars 06:40..(07:00+end_min). The 07:00–07:15 window gets a 1.1020
    high and 1.0990 low (30-pip range). `last_c` overrides the final close."""
    rows = []
    start = pd.Timestamp("2024-01-02 06:40", tz="UTC")
    n = 20 + end_min + 1  # warmup + through end_min past 07:00
    for i in range(n):
        ts = start + pd.Timedelta(minutes=i)
        mid = 1.1000
        h, l = mid + 1 * PIP, mid - 1 * PIP
        in_range = (pd.Timestamp("2024-01-02 07:00", tz="UTC") <= ts
                    < pd.Timestamp("2024-01-02 07:15", tz="UTC"))
        if in_range:
            h, l = 1.1020, 1.0990       # range extremes
        rows.append({"ts": ts, "o": mid, "h": h, "l": l, "c": mid, "v": last_v})
    if last_c is not None:
        rows[-1]["c"] = last_c
        rows[-1]["h"] = max(rows[-1]["h"], last_c)
        rows[-1]["l"] = min(rows[-1]["l"], last_c)
    return pd.DataFrame(rows)


def test_opening_range_formed_and_no_lookahead():
    # ends at 07:20 → range is formed; a big post-window bar must NOT change it
    df = _bars(20, last_c=1.1050)   # 07:20 close 1.1050 (post-range spike)
    hi, lo, rng_pips, rng_end = opening_range(df, "07:00", 15, PIP)
    assert hi == 1.1020 and lo == 1.0990          # only the 07:00–07:15 window
    assert round(rng_pips, 1) == 30.0


def test_range_not_formed_returns_none():
    df = _bars(10)   # only reaches 07:10, window (…07:15) not closed
    assert opening_range(df, "07:00", 15, PIP) is None


def test_breakout_long_signal():
    df = _bars(20, last_c=1.1025)   # breaks above 1.1020
    sig = make_orb_strategy({"use_volume": False})(Ctx(df))
    assert sig and sig["direction"] == "long"
    assert round(sig["sl_pips"], 1) == 30.0
    assert round(sig["tp_pips"], 1) == 45.0        # 1.5 × range


def test_no_breakout_returns_none():
    df = _bars(20, last_c=1.1005)   # still inside the range
    assert make_orb_strategy()(Ctx(df)) is None


def test_volume_filter_blocks_low_volume_breakout():
    df = _bars(20, last_c=1.1025, last_v=100)      # breakout bar same volume as avg
    sig = make_orb_strategy({"use_volume": True, "vol_mult": 1.5})(Ctx(df))
    assert sig is None                              # 100 < 1.5 × 100 avg
