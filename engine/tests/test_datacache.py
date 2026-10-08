"""Cache-vs-DB equivalence: the parquet cache must reproduce the DB frame and the
same train/valid split EXACTLY — otherwise caching would quietly alter the
experiment. Requires the DB (like data/tests)."""
import asyncio

import pytest

from ta_engine.loader import load_candles
from engine.datacache import verify_equiv, load_split_cached
from engine.partition import partition_frame

PAIR, TF, LIM = "EUR_USD", "M1", 5_000


def test_cache_equivalence():
    # all DB access in ONE event loop (asyncpg pool is bound to its loop)
    async def _all():
        eq = await verify_equiv(PAIR, TF, LIM)           # refreshes the cache
        db = await load_candles(PAIR, TF, LIM)
        cached_train = await load_split_cached(PAIR, TF, "train", LIM)  # reads cache
        split_eq = partition_frame(db, "train").equals(cached_train)
        return eq, split_eq
    eq, split_eq = asyncio.run(_all())
    assert eq is True            # cache frame == DB frame, exactly
    assert split_eq is True      # cached train split == DB train split, exactly


def test_cached_split_refuses_vault():
    with pytest.raises(PermissionError):
        asyncio.run(load_split_cached(PAIR, TF, "vault", LIM))
