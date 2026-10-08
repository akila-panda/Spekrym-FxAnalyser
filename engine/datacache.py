"""Candle-frame cache — a pure infrastructure optimisation.

The DB load of ~200k M1 rows dominates every experiment (~3 min). This caches
the exact frame `load_candles` returns to a local pickle and serves it on later
runs. Pickle (not parquet) is used deliberately: it round-trips dtypes and
tz-aware timestamps with zero coercion and no extra dependency, so cache == DB
exactly. It must NOT change anything the referee cares about: the data boundary,
timestamps, candle completeness, bid/ask columns, or (via `partition_frame`) the
train/valid/vault split. `verify_equiv` proves cache == DB before V1.5 trusts it.
"""
from __future__ import annotations

from pathlib import Path

import pandas as pd

from ta_engine.loader import load_candles
from engine.partition import partition_frame

CACHE_DIR = Path(__file__).parent / "cache"


def _path(pair: str, tf: str, limit: int) -> Path:
    return CACHE_DIR / f"{pair}_{tf}_{limit}.pkl"


async def cached_candles(pair: str, tf: str = "M1", limit: int = 200_000,
                         refresh: bool = False) -> pd.DataFrame:
    p = _path(pair, tf, limit)
    if p.exists() and not refresh:
        return pd.read_pickle(p)
    df = await load_candles(pair, tf, limit)
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    df.to_pickle(p)
    return pd.read_pickle(p)               # serve the round-tripped frame


async def load_split_cached(pair: str, tf: str = "M1", split: str = "train",
                            limit: int = 200_000, refresh: bool = False) -> pd.DataFrame:
    if split == "vault":
        raise PermissionError("vault is locked; use engine.partition.load_vault")
    df = await cached_candles(pair, tf, limit, refresh)
    return partition_frame(df, split)      # same partition logic as the DB path


async def verify_equiv(pair: str, tf: str = "M1", limit: int = 5_000) -> bool:
    """True iff the cached (parquet round-tripped) frame equals the DB frame
    exactly — same columns, dtypes, timestamps and values."""
    db = await load_candles(pair, tf, limit)
    cached = await cached_candles(pair, tf, limit, refresh=True)
    return db.equals(cached)
