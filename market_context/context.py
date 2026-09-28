"""Assemble every brain-input detector into one causal market-context snapshot.

`build_context` is pure (takes a dict of {timeframe -> DataFrame}), so it is
fully testable without a DB. `get_market_context` is the async convenience
wrapper that loads D1/H4/H1 for a pair and calls it. The snapshot is the single
structured object the (future) decision layer reads its confluences from.

Design: multi-timeframe *structure* across all provided timeframes (regime
alignment), while the intraday levels / imbalances / liquidity / premium-discount
/ displacement are read from the entry timeframe (H1 for the day system).
"""
from __future__ import annotations

import pandas as pd

from market_context.structure import market_structure
from market_context.levels import all_levels
from market_context.premium_discount import premium_discount
from market_context.imbalance import active_fvgs, inverted_fvgs
from market_context.liquidity import liquidity_pools
from market_context.displacement import displacement

DAY_TIMEFRAMES = ("D1", "H4", "H1")


def build_context(pair: str, frames: dict[str, pd.DataFrame],
                  entry_tf: str = "H1") -> dict:
    """frames: {tf -> ascending OHLCV df}. Returns a causal context snapshot."""
    entry = frames.get(entry_tf)
    if entry is None or entry.empty:
        return {"pair": pair, "error": "no_entry_data", "entry_tf": entry_tf}

    price = float(entry["c"].iloc[-1])
    as_of = str(entry["ts"].iloc[-1])

    structure = {tf: market_structure(df) for tf, df in frames.items() if not df.empty}
    trends = {tf: s["trend"] for tf, s in structure.items()}
    aligned = (len(set(trends.values())) == 1 and next(iter(trends.values())) in ("bullish", "bearish"))

    return {
        "pair": pair,
        "as_of": as_of,
        "entry_tf": entry_tf,
        "price": round(price, 6),
        "mtf_trends": trends,
        "mtf_aligned": bool(aligned),
        "structure": structure,
        "levels": all_levels(entry),
        "premium_discount": premium_discount(entry),
        "fvg_active": active_fvgs(entry, lookback=300),
        "fvg_inverted": inverted_fvgs(entry, lookback=300),
        "liquidity": liquidity_pools(entry),
        "displacement": displacement(entry),
    }


async def get_market_context(pair: str, timeframes: tuple = DAY_TIMEFRAMES,
                             limit: int = 500, entry_tf: str = "H1") -> dict:
    from ta_engine.loader import load_candles
    frames = {}
    for tf in timeframes:
        frames[tf] = await load_candles(pair, tf, limit=limit)
    return build_context(pair, frames, entry_tf=entry_tf)
