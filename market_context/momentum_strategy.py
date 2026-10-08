"""V1.5 — intraday session-momentum strategy (Gao/Han/Zhou style).

Measure the return over the first `signal_min` minutes of the session; if it
clears a noise threshold, enter in that direction and hold (wide stops → the
engine's session-close exit dominates). Tests whether early-session direction
predicts the rest of the session on EUR/USD, net of cost.
"""
from __future__ import annotations

import pandas as pd

from market_context.orb_strategy import _today_open

DEFAULT_CFG = {
    "session_open": "07:00",
    "signal_min": 60,            # measure momentum over the first hour
    "entry_window_min": 30,      # enter within this window after the signal forms
    "min_move_pips": 3.0,        # ignore sub-noise early moves
    "sl_pips": 30.0,             # wide — hold toward session close
    "tp_pips": 30.0,
    "pip": 0.0001,
}


def make_session_momentum_strategy(cfg: dict | None = None):
    cfg = {**DEFAULT_CFG, **(cfg or {})}
    pip = cfg["pip"]

    def strategy_fn(ctx):
        m1 = ctx.m1.tail(600)
        if len(m1) < 5:
            return None
        now = pd.to_datetime(m1["ts"].iloc[-1], utc=True)
        op = _today_open(now, cfg["session_open"])
        sig_end = op + pd.Timedelta(minutes=cfg["signal_min"])
        if now < sig_end:
            return None                              # momentum window not closed
        if now > sig_end + pd.Timedelta(minutes=cfg["entry_window_min"]):
            return None
        tcol = pd.to_datetime(m1["ts"], utc=True)
        sess = m1[tcol >= op]
        if len(sess) < 2:
            return None
        open_price = float(sess["o"].iloc[0])
        price = float(m1["c"].iloc[-1])
        move_pips = (price - open_price) / pip
        if abs(move_pips) < cfg["min_move_pips"]:
            return None
        direction = "long" if move_pips > 0 else "short"
        return {"direction": direction, "sl_pips": cfg["sl_pips"],
                "tp_pips": cfg["tp_pips"],
                "reason": f"mom_{cfg['session_open']}_{cfg['signal_min']}m"}

    return strategy_fn
