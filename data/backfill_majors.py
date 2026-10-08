"""Phase 1 backfill: ONE FX major x all TFs, 12mo, ALL bid/ask.
QA + manifest each (instrument,tf). Run: python -m data.backfill_majors GBP_USD"""
import asyncio
import sys

import pandas as pd
from sqlalchemy import text

from data.db import get_session
from data.oanda_client import OandaClient
from data.fetch_ohlcv import backfill_pair
from data.instruments import FX_MAJORS, TIMEFRAMES
from data import manifest, qa

NEW = [p for p in FX_MAJORS if p != "EUR_USD"]


async def _qa_record(pair, tf):
    async with get_session() as s:
        r = await s.execute(text("SELECT ts FROM candles WHERE pair=:p AND tf=:t ORDER BY ts"),
                            {"p": pair, "t": tf})
        ts = [row[0] for row in r.fetchall()]
    res = qa.check(pd.DataFrame({"ts": ts}), tf)
    manifest.record(pair, tf, res["rows"], str(ts[0]) if ts else "",
                    str(ts[-1]) if ts else "", res["status"])
    return res


async def main(pair):
    c = OandaClient()
    try:
        for tf in TIMEFRAMES:
            await backfill_pair(c, pair, tf, years=1, bidask=True)
            res = await _qa_record(pair, tf)
            print(pair, tf, res["rows"], res["status"], flush=True)
    finally:
        await c.close()
    print(f"{pair}_DONE")


if __name__ == "__main__":
    p = sys.argv[1] if len(sys.argv) > 1 else "GBP_USD"
    asyncio.run(main(p))
