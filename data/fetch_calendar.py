import asyncio
import hashlib
import logging
from datetime import datetime, timezone

import httpx
from sqlalchemy import text
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception

from data.db import get_session

logger = logging.getLogger("fetch_calendar")

FF_THISWEEK_URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.json"
FF_NEXTWEEK_URL = "https://nfs.faireconomy.media/ff_calendar_nextweek.json"
SOURCE = "forexfactory"
RELEVANT_CURRENCIES = {"USD", "EUR", "GBP", "JPY", "AUD", "CAD"}

UPSERT_SQL = text(
    """
    INSERT INTO calendar_events (id, ts, currency, impact, title, actual, forecast, previous, source)
    VALUES (:id, :ts, :currency, :impact, :title, :actual, :forecast, :previous, :source)
    ON CONFLICT (id) DO UPDATE SET
        actual = EXCLUDED.actual, forecast = EXCLUDED.forecast,
        previous = EXCLUDED.previous, fetched_at = now()
    """
)


def _is_retryable(exc: Exception) -> bool:
    """Retry only transient failures: network/transport errors and 5xx
    responses. A 4xx (e.g. a 404 for a not-yet-published feed) will never
    succeed on retry, so it should fail fast instead of burning attempts."""
    if isinstance(exc, httpx.TransportError):
        return True
    if isinstance(exc, httpx.HTTPStatusError):
        return exc.response.status_code >= 500
    return False


def _event_id(currency: str, title: str, ts: datetime) -> str:
    raw = f"{currency}|{title}|{ts.isoformat()}"
    return hashlib.sha1(raw.encode()).hexdigest()


def _parse_event(raw: dict) -> dict | None:
    currency = raw.get("country", "")
    if currency not in RELEVANT_CURRENCIES:
        return None
    try:
        ts = datetime.fromisoformat(raw["date"].replace("Z", "+00:00")).astimezone(timezone.utc)
    except (KeyError, ValueError):
        return None
    title = raw.get("title", "").strip()
    return {
        "id": _event_id(currency, title, ts),
        "ts": ts,
        "currency": currency,
        "impact": raw.get("impact", "Low"),
        "title": title,
        "actual": raw.get("actual") or None,
        "forecast": raw.get("forecast") or None,
        "previous": raw.get("previous") or None,
        "source": SOURCE,
    }


@retry(
    reraise=True,
    stop=stop_after_attempt(4),
    wait=wait_exponential(multiplier=1, min=1, max=20),
    retry=retry_if_exception(_is_retryable),
)
async def _fetch_json(url: str) -> list[dict]:
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        return resp.json()


async def fetch_and_store(url: str):
    raw_events = await _fetch_json(url)
    rows = [e for e in (_parse_event(r) for r in raw_events) if e]
    if not rows:
        logger.info("no relevant events from %s", url)
        return
    async with get_session() as session:
        await session.execute(UPSERT_SQL, rows)
        await session.commit()
    logger.info("stored %d calendar events from %s", len(rows), url)


async def sync_calendar():
    for url in (FF_THISWEEK_URL, FF_NEXTWEEK_URL):
        try:
            await fetch_and_store(url)
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                # an optional feed (e.g. next week's) may not be published yet
                logger.warning("calendar feed unavailable (404), skipping: %s", url)
            else:
                logger.exception("calendar sync failed for %s", url)
        except Exception:
            logger.exception("calendar sync failed for %s", url)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(sync_calendar())