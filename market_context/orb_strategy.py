"""V1.1 + V1.2 — Opening Range Breakout (ORB) day-trade strategy.

`opening_range(...)` is the primitive: the high/low of the first N minutes after
a session open, computed only from bars inside that window (no look-ahead).
`make_orb_strategy(cfg)` returns a `strategy_fn(ctx)` for the scalp engine: after
the range forms, enter on a break of its high (long) / low (short) within an
entry window, with session-sized targets (target = mult × range). The engine
handles bid/ask fills, the spread, and flat-by-session-end. See DEVELOPMENT_ROADMAP V1.
"""
from __future__ import annotations

import pandas as pd

DEFAULT_CFG = {
    "session_open": "07:00",     # London 07:00 / NY 13:00 UTC
    "mode": "breakout",          # "breakout" | "fade" (fade = trade the reversion)
    "range_min": 15,             # opening-range length (minutes)
    "entry_window_min": 180,     # only take a breakout within this window after the range
    "target_mult": 1.5,          # take-profit = target_mult × range width
    "min_stop_pips": 6.0,        # ignore degenerate ranges (too tight)
    "max_stop_pips": 40.0,       # ignore blown-out ranges (news gap)
    "use_volume": False,
    "vol_mult": 1.5,
    "vol_lookback": 20,
    "use_vwap": False,
    "max_tail": 600,             # causal slice bound; raise for wide ranges (Asian)
    "pip": 0.0001,
}


def _today_open(ts: pd.Timestamp, session_open: str) -> pd.Timestamp:
    h, m = session_open.split(":")
    return ts.normalize() + pd.Timedelta(hours=int(h), minutes=int(m))


def opening_range(m1: pd.DataFrame, session_open: str, range_min: int, pip: float):
    """Return (high, low, range_pips, range_end) for today's opening range, using
    ONLY bars in [open, open+range_min). None if the window hasn't closed yet or
    has too few bars. `m1` is the causal slice ending at 'now'."""
    now = pd.to_datetime(m1["ts"].iloc[-1], utc=True)
    op = _today_open(now, session_open)
    rng_end = op + pd.Timedelta(minutes=range_min)
    if now < rng_end:
        return None                                   # range not formed yet
    tcol = pd.to_datetime(m1["ts"], utc=True)
    rbars = m1[(tcol >= op) & (tcol < rng_end)]       # window only — no look-ahead
    if len(rbars) < 2:
        return None
    hi = float(rbars["h"].max())
    lo = float(rbars["l"].min())
    return hi, lo, (hi - lo) / pip, rng_end


def make_orb_strategy(cfg: dict | None = None):
    cfg = {**DEFAULT_CFG, **(cfg or {})}
    pip = cfg["pip"]

    def strategy_fn(ctx):
        # Only today's session matters; bound the slice so per-bar work is O(1),
        # not O(n). The window must reach back past the range open (wider for Asian).
        m1 = ctx.m1.tail(cfg["max_tail"])
        if len(m1) < cfg["vol_lookback"] + 2:
            return None
        rng = opening_range(m1, cfg["session_open"], cfg["range_min"], pip)
        if rng is None:
            return None
        hi, lo, rng_pips, rng_end = rng
        now = pd.to_datetime(m1["ts"].iloc[-1], utc=True)
        if now > rng_end + pd.Timedelta(minutes=cfg["entry_window_min"]):
            return None                               # breakout window has passed
        if not (cfg["min_stop_pips"] <= rng_pips <= cfg["max_stop_pips"]):
            return None

        last = m1.iloc[-1]
        price = float(last["c"])
        if price > hi:
            direction = "long"
        elif price < lo:
            direction = "short"
        else:
            return None
        if cfg["mode"] == "fade":        # trade the reversion, not the breakout
            direction = "short" if direction == "long" else "long"

        if cfg["use_volume"]:
            avg_v = m1["v"].tail(cfg["vol_lookback"]).mean()
            if not (float(last["v"]) >= cfg["vol_mult"] * avg_v):
                return None
        if cfg["use_vwap"]:
            tcol = pd.to_datetime(m1["ts"], utc=True)
            sess = m1[tcol >= _today_open(now, cfg["session_open"])]
            tp = (sess["h"] + sess["l"] + sess["c"]) / 3.0
            vwap = float((tp * sess["v"]).sum() / max(float(sess["v"].sum()), 1e-9))
            if (direction == "long" and price < vwap) or \
               (direction == "short" and price > vwap):
                return None

        return {"direction": direction, "sl_pips": rng_pips,
                "tp_pips": cfg["target_mult"] * rng_pips,
                "reason": f"orb_{cfg['session_open']}_{cfg['range_min']}m"}

    return strategy_fn
