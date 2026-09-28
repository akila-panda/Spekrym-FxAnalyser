import asyncio
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import text

from data.db import get_session
from data.fetch_ohlcv import PAIRS

logger = logging.getLogger("validation")

INSERT_GAP_SQL = text(
    """
    INSERT INTO ingestion_gaps (pair, gap_start, gap_end, missing_count)
    VALUES (:pair, :gap_start, :gap_end, :missing_count)
    """
)


def _is_market_closed(ts: datetime) -> bool:
    """FX market: closed from Fri 21:00 UTC to Sun 21:00 UTC."""
    wd, hour = ts.weekday(), ts.hour  # Mon=0 ... Sun=6
    if wd == 5:  # Saturday
        return True
    if wd == 4 and hour >= 21:  # Friday after 21:00
        return True
    if wd == 6 and hour < 21:  # Sunday before 21:00
        return True
    return False


async def detect_gaps(pair: str, lookback_days: int = 30) -> list[tuple[datetime, datetime]]:
    since = datetime.now(timezone.utc) - timedelta(days=lookback_days)
    async with get_session() as session:
        result = await session.execute(
            text("SELECT ts FROM candles WHERE pair = :pair AND ts >= :since ORDER BY ts"),
            {"pair": pair, "since": since},
        )
        timestamps = [row[0] for row in result.fetchall()]

    if len(timestamps) < 2:
        return []

    gaps = []
    for prev, curr in zip(timestamps, timestamps[1:]):
        expected = prev + timedelta(hours=1)
        missing = []
        cursor = expected
        while cursor < curr:
            if not _is_market_closed(cursor):
                missing.append(cursor)
            cursor += timedelta(hours=1)
        if missing:
            gaps.append((missing[0], missing[-1]))
            async with get_session() as session:
                await session.execute(
                    INSERT_GAP_SQL,
                    {"pair": pair, "gap_start": missing[0], "gap_end": missing[-1],
                     "missing_count": len(missing)},
                )
                await session.commit()
            logger.warning("gap detected in %s: %s -> %s (%d candles)",
                            pair, missing[0], missing[-1], len(missing))
    return gaps


async def detect_all_gaps(lookback_days: int = 30):
    all_gaps = {}
    for pair in PAIRS:
        gaps = await detect_gaps(pair, lookback_days)
        if gaps:
            all_gaps[pair] = gaps
    return all_gaps


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(detect_all_gaps())