"""Reference levels: prior-day / prior-week highs & lows, and session highs/lows.

All functions are CAUSAL: given a DataFrame of candles up to the decision time
(`ts` tz-aware UTC, columns o/h/l/c), they return only levels drawn from
*completed* prior periods, so nothing uses information from the future or the
still-forming current period. These are the deterministic liquidity reference
points a discretionary trader marks on the chart (PDH/PDL, PWH/PWL, session H/L,
which are themselves buy-side / sell-side liquidity pools).
"""
from __future__ import annotations

import pandas as pd

# Session windows in UTC (start_hour inclusive, end_hour exclusive).
SESSIONS = {
    "asia": (0, 8),
    "london": (7, 16),
    "new_york": (12, 21),
}


def _require_ts(df: pd.DataFrame) -> pd.Series:
    return pd.to_datetime(df["ts"], utc=True)


def _prior_period_levels(df: pd.DataFrame, freq: str) -> dict | None:
    """High/low of the most recent COMPLETED period (freq='D' or 'W').
    The last period present is treated as the current/incomplete one and skipped.
    """
    if df.empty:
        return None
    ts = _require_ts(df)
    periods = ts.dt.to_period(freq)
    uniq = periods.drop_duplicates().sort_values().tolist()
    if len(uniq) < 2:
        return None
    prior = uniq[-2]  # the completed period immediately before the current one
    seg = df[(periods == prior).values]
    return {
        "high": float(seg["h"].max()),
        "low": float(seg["l"].min()),
        "period": str(prior),
    }


def prior_day_levels(df: pd.DataFrame) -> dict | None:
    """Prior completed UTC day's high/low (PDH / PDL)."""
    lv = _prior_period_levels(df, "D")
    if lv is None:
        return None
    return {"pdh": lv["high"], "pdl": lv["low"], "day": lv["period"]}


def prior_week_levels(df: pd.DataFrame) -> dict | None:
    """Prior completed ISO week's high/low (PWH / PWL)."""
    lv = _prior_period_levels(df, "W")
    if lv is None:
        return None
    return {"pwh": lv["high"], "pwl": lv["low"], "week": lv["period"]}


def session_levels(df: pd.DataFrame, sessions: dict | None = None) -> dict:
    """High/low of the most recent COMPLETED session of each type before the
    current (last) UTC day. Each session's H/L is a liquidity reference; a
    sweep of it is a common setup trigger.

    Returns e.g. {"asia": {"high":..,"low":..,"date":"2026-09-23"}, ...};
    a session with no data is omitted.
    """
    sessions = sessions or SESSIONS
    if df.empty:
        return {}
    ts = _require_ts(df)
    cur_date = ts.iloc[-1].date()
    hours = ts.dt.hour

    out: dict = {}
    for name, (start_h, end_h) in sessions.items():
        in_sess = ((hours >= start_h) & (hours < end_h)).values
        sdf = df[in_sess]
        if sdf.empty:
            continue
        sdates = ts[in_sess].dt.date
        completed = sorted({d for d in sdates if d < cur_date})
        # fall back to any available session day if none strictly before today
        target = completed[-1] if completed else sorted(set(sdates))[-1]
        seg = sdf[(sdates == target).values]
        out[name] = {
            "high": float(seg["h"].max()),
            "low": float(seg["l"].min()),
            "date": str(target),
        }
    return out


def all_levels(df: pd.DataFrame) -> dict:
    """Bundle every reference level for a context snapshot."""
    return {
        "prior_day": prior_day_levels(df),
        "prior_week": prior_week_levels(df),
        "sessions": session_levels(df),
    }
