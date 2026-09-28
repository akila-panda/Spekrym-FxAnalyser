import asyncio
import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from data.fetch_ohlcv import poll_all_once, backfill_all
from data.fetch_calendar import sync_calendar
from data.validation import detect_all_gaps

logger = logging.getLogger("scheduler")


async def _startup():
    logging.basicConfig(level=logging.INFO)
    logger.info("running initial backfill check")
    await backfill_all()
    await sync_calendar()


def build_scheduler() -> AsyncIOScheduler:
    scheduler = AsyncIOScheduler(timezone="UTC")
    scheduler.add_job(poll_all_once, CronTrigger(minute=0, second=5), id="poll_candles")
    scheduler.add_job(sync_calendar, CronTrigger(hour="0,6,12,18", minute=5), id="sync_calendar")
    scheduler.add_job(detect_all_gaps, CronTrigger(hour=1, minute=0), id="gap_check")
    return scheduler


async def main():
    await _startup()
    scheduler = build_scheduler()
    scheduler.start()
    logger.info("scheduler started")
    await asyncio.Event().wait()


if __name__ == "__main__":
    asyncio.run(main())