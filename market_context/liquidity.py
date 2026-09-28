"""Liquidity pools: buy-side (equal highs) and sell-side (equal lows).

Clusters of swing highs at a similar level are resting buy-side liquidity (stops
of shorts / breakout buys) above price; clusters of swing lows are sell-side
liquidity below. A pool is "swept" once a later candle trades beyond the level —
the classic stop-hunt that often precedes a reversal. Causal: swings and sweeps
use only bars up to the last one.
"""
from __future__ import annotations

import pandas as pd

from ta_engine.support_resistance import find_swing_points


def _cluster(points: list[dict], tol_pct: float) -> list[dict]:
    if not points:
        return []
    pts = sorted(points, key=lambda p: p["price"])
    clusters = [[pts[0]]]
    for p in pts[1:]:
        ref = clusters[-1][-1]["price"]
        if abs(p["price"] - ref) / ref <= tol_pct:
            clusters[-1].append(p)
        else:
            clusters.append([p])
    out = []
    for c in clusters:
        level = sum(p["price"] for p in c) / len(c)
        out.append({"level": round(level, 6), "touches": len(c),
                    "last_index": max(p["index"] for p in c)})
    return out


def liquidity_pools(df: pd.DataFrame, order: int = 2, tol_pct: float = 0.0005,
                    lookback: int = 300, min_touches: int = 2) -> dict:
    """Return {'buy_side': [...], 'sell_side': [...]}. Each pool: level, touches,
    swept (bool), side. Only clusters with >= min_touches (equal highs/lows) are
    returned; single swings are ordinary S/R, not pooled liquidity."""
    scan = df.tail(lookback).reset_index(drop=True) if lookback else df
    highs, lows = find_swing_points(scan, order)
    h = scan["h"].to_numpy(float)
    l = scan["l"].to_numpy(float)
    n = len(scan)
    price = float(scan["c"].iloc[-1])

    def _finish(clusters, side):
        pools = []
        for cl in clusters:
            if cl["touches"] < min_touches:
                continue
            lvl = cl["level"]
            after = range(cl["last_index"] + 1, n)
            if side == "buy_side":
                swept = any(h[j] > lvl for j in after)
            else:
                swept = any(l[j] < lvl for j in after)
            pools.append({"side": side, "level": lvl, "touches": cl["touches"],
                          "swept": bool(swept),
                          "distance": round(lvl - price, 6)})
        return pools

    return {
        "buy_side": _finish(_cluster(highs, tol_pct), "buy_side"),
        "sell_side": _finish(_cluster(lows, tol_pct), "sell_side"),
    }
