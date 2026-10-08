"""Index opening-auction ORB (NAS100 etc.) — the first NON-FX instrument.

Unlike FX, an equity index has a real 9:30 ET opening auction (Crabel's classic
ORB context). The opening range is the first N minutes after 9:30 America/New_York
(DST-correct via zoneinfo), traded within an entry window, flat by session end.

Variants (pre-registered in the runner): breakout vs fade; immediate vs retest
entry; with/without a relative-volume condition. Prices are in index POINTS
(pass pip=1.0 to the engine). Causal: the range uses only its own window; the
breakout is the first causal cross; the retest requires an earlier break then a
pullback that holds — all observable at decision time.
"""
from __future__ import annotations

from datetime import datetime, time
from zoneinfo import ZoneInfo

import pandas as pd

ET = ZoneInfo("America/New_York")
UTC = ZoneInfo("UTC")

DEFAULT_CFG = {
    "open_et": "09:30",
    "range_min": 15,
    "entry_window_min": 120,     # trade only within 2h of the range forming
    "target_mult": 1.5,
    "mode": "breakout",          # "breakout" | "fade"
    "require_retest": False,
    "retest_band_pts": 5.0,      # how close price must return to the level
    "use_relvol": False,
    "relvol_mult": 1.5,
    "relvol_lookback": 20,
    "min_stop_pts": 5.0,
    "max_stop_pts": 120.0,
    "max_tail": 900,
    "pip": 1.0,                  # index points
}


def _open_utc(now_utc: pd.Timestamp, open_et: str) -> pd.Timestamp:
    h, m = map(int, open_et.split(":"))
    et_date = now_utc.tz_convert(ET).date()
    dt_et = datetime.combine(et_date, time(h, m), tzinfo=ET)
    return pd.Timestamp(dt_et).tz_convert(UTC)


def make_index_orb_strategy(cfg: dict | None = None):
    cfg = {**DEFAULT_CFG, **(cfg or {})}
    pip = cfg["pip"]

    def strategy_fn(ctx):
        m1 = ctx.m1.tail(cfg["max_tail"])
        if len(m1) < cfg["relvol_lookback"] + 3:
            return None
        tcol = pd.to_datetime(m1["ts"], utc=True)
        now = tcol.iloc[-1]
        op = _open_utc(now, cfg["open_et"])
        rng_end = op + pd.Timedelta(minutes=cfg["range_min"])
        if now < rng_end or now > rng_end + pd.Timedelta(minutes=cfg["entry_window_min"]):
            return None
        rbars = m1[(tcol >= op) & (tcol < rng_end)]
        if len(rbars) < 2:
            return None
        hi = float(rbars["h"].max()); lo = float(rbars["l"].min())
        rng_pts = (hi - lo) / pip
        if not (cfg["min_stop_pts"] <= rng_pts <= cfg["max_stop_pts"]):
            return None

        post = m1[tcol >= rng_end]
        if len(post) < 2:
            return None
        last = post.iloc[-1]; prev = post.iloc[-2]
        price = float(last["c"])

        band = cfg["retest_band_pts"] * pip
        if not cfg["require_retest"]:
            up = (float(prev["c"]) <= hi) and (price > hi)      # first causal cross up
            dn = (float(prev["c"]) >= lo) and (price < lo)
        else:
            broke_up = bool((post["h"].iloc[:-1] > hi).any())
            broke_dn = bool((post["l"].iloc[:-1] < lo).any())
            up = broke_up and (float(last["l"]) <= hi + band) and (price > hi)
            dn = broke_dn and (float(last["h"]) >= lo - band) and (price < lo)

        if up:
            direction = "long"
        elif dn:
            direction = "short"
        else:
            return None
        if cfg["mode"] == "fade":
            direction = "short" if direction == "long" else "long"

        if cfg["use_relvol"]:
            avg_v = m1["v"].tail(cfg["relvol_lookback"]).mean()
            if not (float(last["v"]) >= cfg["relvol_mult"] * avg_v):
                return None

        return {"direction": direction, "sl_pips": rng_pts,
                "tp_pips": cfg["target_mult"] * rng_pts,
                "reason": f"idxorb_{cfg['mode']}_{cfg['range_min']}m"}

    return strategy_fn
