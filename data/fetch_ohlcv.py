import asyncio
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import text

from data.db import get_session
from data.oanda_client import OandaClient, CircuitOpenError

logger = logging.getLogger("fetch_ohlcv")

PAIRS = ["EUR_USD", "GBP_USD", "USD_JPY", "AUD_USD", "USD_CAD"]
GRANULARITY = "H1"
MAX_CANDLES_PER_REQUEST = 5000
BACKFILL_YEARS = 2

# how far back one candle steps, per granularity -- used only to nudge the
# pagination cursor past the earliest returned candle.
_TF_STEP = {
    "M1": timedelta(minutes=1), "M5": timedelta(minutes=5),
    "M15": timedelta(minutes=15), "M30": timedelta(minutes=30),
    "H1": timedelta(hours=1), "H4": timedelta(hours=4), "D1": timedelta(days=1),
}

UPSERT_SQL = text(
    """
    INSERT INTO candles (pair, tf, ts, o, h, l, c, v, complete)
    VALUES (:pair, :tf, :ts, :o, :h, :l, :c, :v, :complete)
    ON CONFLICT (pair, tf, ts) DO UPDATE SET
        o = EXCLUDED.o, h = EXCLUDED.h, l = EXCLUDED.l,
        c = EXCLUDED.c, v = EXCLUDED.v, complete = EXCLUDED.complete
    """
)


def _to_row(pair: str, candle: dict, tf: str = "H1") -> dict:
    mid = candle["mid"]
    return {
        "pair": pair,
        "tf": tf,
        "ts": datetime.fromisoformat(candle["time"].replace("Z", "+00:00")),
        "o": float(mid["o"]),
        "h": float(mid["h"]),
        "l": float(mid["l"]),
        "c": float(mid["c"]),
        "v": int(candle["volume"]),
        "complete": bool(candle["complete"]),
    }


async def _store_candles(pair: str, candles: list[dict], tf: str = "H1"):
    if not candles:
        return
    rows = [_to_row(pair, c, tf) for c in candles]
    async with get_session() as session:
        await session.execute(UPSERT_SQL, rows)
        await session.commit()
    logger.info("stored %d %s candles for %s", len(rows), tf, pair)


# --- bid/ask (MBA) ingestion path for scalping (Phase A) ---
UPSERT_BA_SQL = text(
    """
    INSERT INTO candles (pair, tf, ts, o, h, l, c, v, complete,
                         bid_o, bid_h, bid_l, bid_c, ask_o, ask_h, ask_l, ask_c)
    VALUES (:pair, :tf, :ts, :o, :h, :l, :c, :v, :complete,
            :bid_o, :bid_h, :bid_l, :bid_c, :ask_o, :ask_h, :ask_l, :ask_c)
    ON CONFLICT (pair, tf, ts) DO UPDATE SET
        o=EXCLUDED.o, h=EXCLUDED.h, l=EXCLUDED.l, c=EXCLUDED.c,
        v=EXCLUDED.v, complete=EXCLUDED.complete,
        bid_o=EXCLUDED.bid_o, bid_h=EXCLUDED.bid_h, bid_l=EXCLUDED.bid_l, bid_c=EXCLUDED.bid_c,
        ask_o=EXCLUDED.ask_o, ask_h=EXCLUDED.ask_h, ask_l=EXCLUDED.ask_l, ask_c=EXCLUDED.ask_c
    """
)


def _to_row_mba(pair: str, candle: dict, tf: str = "H1") -> dict:
    """Row from an OANDA price='MBA' candle (mid + bid + ask). Mid stays in o/h/l/c."""
    b, a = candle["bid"], candle["ask"]
    m = candle.get("mid")
    if m is None:  # if only BA requested, derive mid = (bid+ask)/2
        m = {k: (float(b[k]) + float(a[k])) / 2 for k in ("o", "h", "l", "c")}
    return {
        "pair": pair, "tf": tf,
        "ts": datetime.fromisoformat(candle["time"].replace("Z", "+00:00")),
        "o": float(m["o"]), "h": float(m["h"]), "l": float(m["l"]), "c": float(m["c"]),
        "v": int(candle["volume"]), "complete": bool(candle["complete"]),
        "bid_o": float(b["o"]), "bid_h": float(b["h"]), "bid_l": float(b["l"]), "bid_c": float(b["c"]),
        "ask_o": float(a["o"]), "ask_h": float(a["h"]), "ask_l": float(a["l"]), "ask_c": float(a["c"]),
    }


async def _store_mba(pair: str, candles: list[dict], tf: str = "H1"):
    if not candles:
        return
    rows = [_to_row_mba(pair, c, tf) for c in candles]
    async with get_session() as session:
        await session.execute(UPSERT_BA_SQL, rows)
        await session.commit()
    logger.info("stored %d %s MBA candles for %s", len(rows), tf, pair)


async def backfill_pair(client: OandaClient, pair: str, tf: str = "H1",
                        years: int = BACKFILL_YEARS, bidask: bool = False):
    """Paginate backward in MAX_CANDLES_PER_REQUEST chunks to cover `years` of
    `tf` candles. `bidask=True` fetches mid+bid+ask (price='MBA') for scalping."""
    step = _TF_STEP.get(tf, timedelta(hours=1))
    price = "MBA" if bidask else "M"
    to_time = datetime.now(timezone.utc)
    since = to_time - timedelta(days=365 * years)
    cursor = to_time

    while cursor > since:
        try:
            candles = await client.get_candles(
                pair, granularity=tf, count=MAX_CANDLES_PER_REQUEST, price=price,
                to_time=cursor.strftime("%Y-%m-%dT%H:%M:%S.000000000Z"),
            )
        except CircuitOpenError:
            logger.warning("breaker open, aborting backfill for %s %s", pair, tf)
            break

        if not candles:
            break

        if bidask:
            await _store_mba(pair, candles, tf)
        else:
            await _store_candles(pair, candles, tf)
        earliest = datetime.fromisoformat(candles[0]["time"].replace("Z", "+00:00"))
        if earliest >= cursor:
            break
        cursor = earliest - step


async def backfill_all(granularities: tuple = ("H1",), years: int = BACKFILL_YEARS):
    client = OandaClient()
    try:
        for tf in granularities:
            for pair in PAIRS:
                logger.info("backfilling %s %s (%dy)", pair, tf, years)
                await backfill_pair(client, pair, tf, years)
    finally:
        await client.close()


async def poll_latest(client: OandaClient, pair: str, tf: str = "H1"):
    """Fetch the last few candles (covers late/partial updates) and upsert."""
    try:
        candles = await client.get_candles(pair, granularity=tf, count=3)
    except CircuitOpenError:
        logger.warning("breaker open, skipping poll for %s %s", pair, tf)
        return
    await _store_candles(pair, candles, tf)


async def poll_all_once(granularities: tuple = ("H1",)):
    client = OandaClient()
    try:
        for tf in granularities:
            for pair in PAIRS:
                await poll_latest(client, pair, tf)
    finally:
        await client.close()


def seconds_until_next_hour(buffer_s: int = 5) -> float:
    now = datetime.now(timezone.utc)
    nxt = (now + timedelta(hours=1)).replace(minute=0, second=0, microsecond=0)
    return (nxt - now).total_seconds() + buffer_s


async def live_poll_loop():
    """Aligns polling to just after each H1 candle close."""
    while True:
        await asyncio.sleep(seconds_until_next_hour())
        try:
            await poll_all_once()
        except Exception:
            logger.exception("live poll cycle failed")


if __name__ == "__main__":
    import argparse
    logging.basicConfig(level=logging.INFO)
    parser = argparse.ArgumentParser()
    parser.add_argument("--granularities", nargs="+", default=["H1"],
                        help="timeframes to backfill, e.g. H1 M15 M5")
    parser.add_argument("--years", type=int, default=BACKFILL_YEARS)
    args = parser.parse_args()
    asyncio.run(backfill_all(tuple(args.granularities), args.years))