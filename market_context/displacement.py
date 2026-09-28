"""Displacement: an outsized, directional candle signalling institutional intent.

A candle is a displacement when its body is large relative to recent volatility
(ATR). Displacement is what creates FVGs and confirms a break of structure, so it
is a key confluence for "is this move real?". Causal: uses only the candles up to
the last one.
"""
from __future__ import annotations

import pandas as pd
from ta.volatility import AverageTrueRange


def displacement(df: pd.DataFrame, atr_period: int = 14, mult: float = 1.5) -> dict:
    if len(df) < atr_period + 1:
        return {"is_displacement": False, "direction": None, "body_atr": None}
    atr = AverageTrueRange(df["h"], df["l"], df["c"], window=atr_period).average_true_range().iloc[-1]
    last = df.iloc[-1]
    body = abs(float(last["c"]) - float(last["o"]))
    if not atr or pd.isna(atr):
        return {"is_displacement": False, "direction": None, "body_atr": None}
    ratio = body / float(atr)
    direction = "up" if last["c"] > last["o"] else "down" if last["c"] < last["o"] else None
    return {
        "is_displacement": bool(ratio >= mult and direction is not None),
        "direction": direction,
        "body_atr": round(ratio, 2),
    }
