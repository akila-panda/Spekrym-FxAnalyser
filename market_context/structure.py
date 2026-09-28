"""Market structure for one timeframe: trend, BOS, and CHoCH.

Built on the existing causal swing detector. Trend is read from the last two
confirmed swing highs and lows (HH+HL = bullish, LH+LL = bearish, else range).
A break of structure (BOS) that runs *with* trend continues it; the first break
*against* the prevailing structural direction is a change of character (CHoCH) —
the earliest structural warning of a reversal.
"""
from __future__ import annotations

import pandas as pd

from ta_engine.support_resistance import find_swing_points
from ta_engine.smc import detect_bos


def _classify_trend(highs: list[dict], lows: list[dict]) -> str:
    if len(highs) < 2 or len(lows) < 2:
        return "undefined"
    hh = highs[-1]["price"] > highs[-2]["price"]
    hl = lows[-1]["price"] > lows[-2]["price"]
    lh = highs[-1]["price"] < highs[-2]["price"]
    ll = lows[-1]["price"] < lows[-2]["price"]
    if hh and hl:
        return "bullish"
    if lh and ll:
        return "bearish"
    return "range"


def market_structure(df: pd.DataFrame, order: int = 2) -> dict:
    highs, lows = find_swing_points(df, order)
    bos_events = detect_bos(df, order)

    # label each BOS as continuation (bos) or reversal (choch)
    structural_dir = None
    events = []
    for e in bos_events:
        this_dir = "bull" if e["type"] == "bullish_bos" else "bear"
        kind = "choch" if (structural_dir is not None and this_dir != structural_dir) else "bos"
        structural_dir = this_dir
        events.append({"type": e["type"], "kind": kind, "ts": e["ts"],
                       "broken_level": e["broken_level"], "index": e["index"]})

    return {
        "trend": _classify_trend(highs, lows),
        "last_swing_high": highs[-1] if highs else None,
        "last_swing_low": lows[-1] if lows else None,
        "last_event": events[-1] if events else None,
        "events": events[-5:],
        "n_swings": len(highs) + len(lows),
    }
