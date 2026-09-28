"""Fair Value Gaps (FVG) and inverted FVGs (iFVG).

A 3-candle imbalance, detected causally at the close of the third candle:
  - bullish FVG: low[i] > high[i-2]  -> unfilled gap [high[i-2], low[i]]
  - bearish FVG: high[i] < low[i-2]  -> unfilled gap [high[i], low[i-2]]

Each gap is then tracked forward: "mitigated" once price trades back into the
zone, and "inverted" (an iFVG) once price *closes fully through* it — at which
point it flips polarity and acts as opposite-side support/resistance. All
forward tracking uses only candles at or after formation, so a snapshot taken at
bar k reflects only what was knowable by bar k.
"""
from __future__ import annotations

import pandas as pd


def detect_fvgs(df: pd.DataFrame, lookback: int | None = None) -> list[dict]:
    """Return every FVG in `df` (optionally only the last `lookback` bars),
    each annotated with mitigation/inversion status computed causally."""
    if lookback is not None:
        df = df.tail(lookback).reset_index(drop=True)
    h = df["h"].to_numpy(float)
    l = df["l"].to_numpy(float)
    c = df["c"].to_numpy(float)
    ts = df["ts"].astype(str).tolist()
    n = len(df)

    fvgs: list[dict] = []
    for i in range(2, n):
        if l[i] > h[i - 2]:
            fvgs.append({"type": "bullish", "top": float(l[i]), "bottom": float(h[i - 2]),
                         "index": i, "ts": ts[i]})
        elif h[i] < l[i - 2]:
            fvgs.append({"type": "bearish", "top": float(l[i - 2]), "bottom": float(h[i]),
                         "index": i, "ts": ts[i]})

    for f in fvgs:
        f["mitigated"] = False
        f["inverted"] = False
        for j in range(f["index"] + 1, n):
            if f["type"] == "bullish":
                if not f["mitigated"] and l[j] <= f["top"]:
                    f["mitigated"] = True
                if c[j] < f["bottom"]:          # closed fully below -> iFVG (now resistance)
                    f["inverted"] = True
                    break
            else:
                if not f["mitigated"] and h[j] >= f["bottom"]:
                    f["mitigated"] = True
                if c[j] > f["top"]:             # closed fully above -> iFVG (now support)
                    f["inverted"] = True
                    break
    return fvgs


def active_fvgs(df: pd.DataFrame, lookback: int | None = None) -> list[dict]:
    """Unmitigated, un-inverted FVGs — the imbalances still open as of the last
    bar (the ones price may be drawn back to)."""
    return [f for f in detect_fvgs(df, lookback) if not f["mitigated"] and not f["inverted"]]


def inverted_fvgs(df: pd.DataFrame, lookback: int | None = None) -> list[dict]:
    """FVGs that have been closed through and now act as opposite-side S/R (iFVG)."""
    return [f for f in detect_fvgs(df, lookback) if f["inverted"]]
