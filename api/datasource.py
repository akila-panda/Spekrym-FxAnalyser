"""Candle sources. Routes depend on the `CandleSource` protocol so tests inject
an in-memory source and production uses Postgres (same table as ta_engine)."""
from __future__ import annotations

from typing import Optional, Protocol

import pandas as pd

COLS = ["ts", "o", "h", "l", "c", "v"]
NATIVE = ("M1", "M5", "M15", "H1")


class CandleSource(Protocol):
    async def candles(self, pair: str, tf: str, start: Optional[pd.Timestamp] = None,
                      end: Optional[pd.Timestamp] = None, before: Optional[pd.Timestamp] = None,
                      limit: int = 5000) -> pd.DataFrame: ...

    async def bounds(self, pair: str) -> dict[str, tuple[Optional[pd.Timestamp], Optional[pd.Timestamp]]]: ...


def resample_h4(h1: pd.DataFrame) -> pd.DataFrame:
    if h1.empty:
        return h1[COLS].copy()
    out = (h1.set_index("ts")
             .resample("4h").agg({"o": "first", "h": "max", "l": "min", "c": "last", "v": "sum"})
             .dropna().reset_index())
    return out[COLS]


def _window(df: pd.DataFrame, start, end, before, limit: int) -> pd.DataFrame:
    if start is not None:
        df = df[df["ts"] >= start]
    if end is not None:
        df = df[df["ts"] <= end]
    if before is not None:
        df = df[df["ts"] < before]
    # forward window -> oldest `limit` bars; otherwise newest `limit` bars
    df = df.head(limit) if start is not None else df.tail(limit)
    return df.reset_index(drop=True)


class InMemorySource:
    """Holds native-timeframe frames (cols ts,o,h,l,c,v; ts tz-aware UTC)."""

    def __init__(self, frames: dict[str, dict[str, pd.DataFrame]]):
        self.frames = frames        # {pair: {tf: df}}

    def _get(self, pair: str, tf: str) -> pd.DataFrame:
        pf = self.frames.get(pair, {})
        if tf == "H4":
            return resample_h4(pf["H1"]) if "H1" in pf else pd.DataFrame(columns=COLS)
        return pf.get(tf, pd.DataFrame(columns=COLS))[COLS]

    async def candles(self, pair, tf, start=None, end=None, before=None, limit=5000):
        return _window(self._get(pair, tf), start, end, before, limit)

    async def bounds(self, pair):
        out = {}
        for tf in ("M1", "M5", "M15", "H1", "H4"):
            df = self._get(pair, tf)
            out[tf] = (df["ts"].iloc[0], df["ts"].iloc[-1]) if len(df) else (None, None)
        return out


class PgSource:
    """Reads the `candles` table (complete bars only). H4 is resampled from H1."""

    async def _query(self, pair, tf, start, end, before, limit) -> pd.DataFrame:
        from sqlalchemy import text
        from data.db import get_session

        where, args = ["pair = :pair", "tf = :tf", "complete = TRUE"], {"pair": pair, "tf": tf, "lim": limit}
        for col, op, val in (("start", ">=", start), ("end", "<=", end), ("before", "<", before)):
            if val is not None:
                where.append(f"ts {op} :{col}")
                args[col] = val.to_pydatetime()
        order = "ASC" if start is not None else "DESC"
        sql = text(f"SELECT ts,o,h,l,c,v FROM candles WHERE {' AND '.join(where)} "
                   f"ORDER BY ts {order} LIMIT :lim")
        async with get_session() as s:
            rows = (await s.execute(sql, args)).fetchall()
        df = pd.DataFrame(rows, columns=COLS)
        if order == "DESC":
            df = df.iloc[::-1]
        df["ts"] = pd.to_datetime(df["ts"], utc=True)
        for c in COLS[1:]:
            df[c] = df[c].astype(float)
        return df.reset_index(drop=True)

    async def candles(self, pair, tf, start=None, end=None, before=None, limit=5000):
        if tf != "H4":
            return await self._query(pair, tf, start, end, before, limit)
        s = start.floor("4h") if start is not None else None
        h1 = await self._query(pair, "H1", s, end, before, limit * 4)
        return _window(resample_h4(h1), start, end, None, limit)

    async def bounds(self, pair):
        from sqlalchemy import text
        from data.db import get_session

        async with get_session() as s:
            rows = (await s.execute(
                text("SELECT tf, MIN(ts), MAX(ts) FROM candles "
                     "WHERE pair=:p AND complete=TRUE GROUP BY tf"), {"p": pair})).fetchall()
        out = {tf: (pd.Timestamp(a, tz="UTC") if a.tzinfo is None else pd.Timestamp(a).tz_convert("UTC"),
                    pd.Timestamp(b, tz="UTC") if b.tzinfo is None else pd.Timestamp(b).tz_convert("UTC"))
               for tf, a, b in rows}
        h1 = out.get("H1")
        out["H4"] = (h1[0].floor("4h"), h1[1].floor("4h")) if h1 else (None, None)
        return {tf: out.get(tf, (None, None)) for tf in ("M1", "M5", "M15", "H1", "H4")}