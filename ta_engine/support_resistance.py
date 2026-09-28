import numpy as np
import pandas as pd
from numpy.lib.stride_tricks import sliding_window_view


def find_swing_points(df: pd.DataFrame, order: int = 2) -> tuple[list[dict], list[dict]]:
    """Fractal-based swing highs/lows: a point is a swing if it's the strict,
    unique extreme within +/- `order` candles on either side.

    Vectorized with numpy sliding windows -- the earlier per-candle
    `.tolist().count()` made this the dominant cost in every backtest bar
    (~100ms each for the SMC facts). Output is identical to that version.
    """
    n = len(df)
    w = 2 * order + 1
    if n < w:
        return [], []

    h = df["h"].to_numpy(dtype=float)
    l = df["l"].to_numpy(dtype=float)
    ts = df["ts"].to_numpy()

    hw = sliding_window_view(h, w)   # (n-w+1, w), row r centered at index r+order
    lw = sliding_window_view(l, w)
    c = order
    center_h = hw[:, c]
    center_l = lw[:, c]
    # strict unique max/min: center equals the window extreme AND appears once
    is_high = (center_h == hw.max(axis=1)) & ((hw == center_h[:, None]).sum(axis=1) == 1)
    is_low = (center_l == lw.min(axis=1)) & ((lw == center_l[:, None]).sum(axis=1) == 1)

    highs = [{"ts": str(ts[r + c]), "price": float(h[r + c]), "index": int(r + c)}
             for r in np.flatnonzero(is_high)]
    lows = [{"ts": str(ts[r + c]), "price": float(l[r + c]), "index": int(r + c)}
            for r in np.flatnonzero(is_low)]
    return highs, lows


def _cluster(points: list[dict], tol_pct: float) -> list[dict]:
    if not points:
        return []
    sorted_points = sorted(points, key=lambda p: p["price"])
    clusters = [[sorted_points[0]]]
    for p in sorted_points[1:]:
        ref = clusters[-1][-1]["price"]
        if abs(p["price"] - ref) / ref <= tol_pct:
            clusters[-1].append(p)
        else:
            clusters.append([p])
    zones = []
    for c in clusters:
        avg = sum(p["price"] for p in c) / len(c)
        zones.append({"level": round(avg, 6), "touches": len(c)})
    return zones


def compute_sr_zones(df: pd.DataFrame, order: int = 2, tol_pct: float = 0.0015) -> dict:
    """Swing-based support/resistance zones, clustered by proximity."""
    if len(df) < (2 * order + 1):
        return {"resistance": [], "support": []}

    highs, lows = find_swing_points(df, order)
    resistance = sorted(_cluster(highs, tol_pct), key=lambda z: -z["level"])
    support = sorted(_cluster(lows, tol_pct), key=lambda z: -z["level"])
    return {"resistance": resistance, "support": support}