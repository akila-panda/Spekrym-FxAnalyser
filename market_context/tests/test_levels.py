"""Tests for causal reference-level detection."""
import numpy as np
import pandas as pd

from market_context.levels import (
    prior_day_levels, prior_week_levels, session_levels,
)


def make_df(start="2026-09-21 00:00", periods=54, base=1.10):
    ts = pd.date_range(start, periods=periods, freq="h", tz="UTC")
    c = np.full(periods, base)
    return pd.DataFrame({"ts": ts, "o": c, "h": c + 0.0005, "l": c - 0.0005,
                         "c": c, "v": 1000})


def test_prior_day_levels_and_causality():
    # 54 hourly bars from 21 Sep 00:00 -> day 21 (full), 22 (full), 23 (00:00-05:00 partial)
    df = make_df(periods=54)
    df.loc[30, "h"] = 1.1500   # day 22 high  (PDH)
    df.loc[35, "l"] = 1.0900   # day 22 low   (PDL)
    df.loc[50, "h"] = 1.1600   # day 23 (current, incomplete) -> must be EXCLUDED

    lv = prior_day_levels(df)
    assert lv["pdh"] == 1.1500
    assert lv["pdl"] == 1.0900
    assert str(lv["day"]) == "2026-09-22"
    # the current-day 1.1600 high must not leak into the prior-day level
    assert lv["pdh"] != 1.1600


def test_prior_day_none_when_single_day():
    df = make_df(periods=6)  # only part of one day
    assert prior_day_levels(df) is None


def test_session_levels_present_and_dated():
    df = make_df(periods=54)
    # inject a clear Asia-session (hour 2, day 22 = row 26) high
    df.loc[26, "h"] = 1.1200
    sess = session_levels(df)
    assert set(sess) == {"asia", "london", "new_york"}
    # most recent completed session before current day (23) is day 22
    assert sess["asia"]["date"] == "2026-09-22"
    assert sess["asia"]["high"] >= 1.1200


def test_prior_week_levels():
    # 12 days hourly spans at least two ISO weeks
    df = make_df(periods=24 * 12)
    lv = prior_week_levels(df)
    assert lv is not None
    assert "pwh" in lv and "pwl" in lv and lv["pwh"] >= lv["pwl"]


def test_prior_week_none_when_single_week():
    df = make_df(periods=24 * 2)  # ~2 days, one ISO week
    assert prior_week_levels(df) is None
