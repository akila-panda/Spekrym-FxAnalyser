"""Premium / discount relative to the current dealing range.

The dealing range is the significant recent trading range — the highest high and
lowest low over a `lookback` window (for the H1 day system, ~90 bars ≈ the
current multi-day leg), rather than the last two micro-fractals, which produced a
too-local range. Its midpoint is equilibrium (50%); price above is a "premium"
(favour shorts / avoid longs), below is a "discount" (favour longs). The 62–79%
retracement is the classic optimal-trade-entry (OTE) zone. Causal: the range uses
only bars up to the last one, which always bracket the current price.
"""
from __future__ import annotations

import pandas as pd


def premium_discount(df: pd.DataFrame, lookback: int = 90, eq_band: float = 0.02) -> dict | None:
    if len(df) < 5:
        return None
    scan = df.tail(lookback)
    range_high = float(scan["h"].max())
    range_low = float(scan["l"].min())
    rng = range_high - range_low
    if rng <= 0:
        return None

    price = float(df["c"].iloc[-1])
    pct = (price - range_low) / rng  # 0 at range low, 1 at range high

    if pct > 0.5 + eq_band:
        zone = "premium"
    elif pct < 0.5 - eq_band:
        zone = "discount"
    else:
        zone = "equilibrium"

    # OTE: 62–79% retracement measured from the side price is retracing toward
    in_ote_long = 0.205 <= pct <= 0.395   # discount OTE (retrace of an up-leg)
    in_ote_short = 0.605 <= pct <= 0.795  # premium OTE (retrace of a down-leg)

    return {
        "range_high": round(range_high, 6),
        "range_low": round(range_low, 6),
        "equilibrium": round((range_high + range_low) / 2, 6),
        "price": round(price, 6),
        "pct_of_range": round(float(pct), 4),
        "zone": zone,
        "lookback": lookback,
        "in_ote_long": bool(in_ote_long),
        "in_ote_short": bool(in_ote_short),
    }
