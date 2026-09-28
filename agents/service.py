"""Live analysis service: assemble full market context (facts + forecast +
cross-pair returns + upcoming calendar) for each pair, run the Strategy
Coordinator, and log every decision.

Unlike the single-pair backtest, this fills in the cross-rate, risk-sentiment
and calendar inputs, so the fundamental and sentiment trees actually vote here.

Run: python -m agents.service          # analyze all pairs, print + log
"""
from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timedelta, timezone

import numpy as np
from sqlalchemy import text

from agents.base import build_context_from_window
from agents.coordinator import StrategyCoordinator
from agents.audit import log_decision
from data.db import get_session
from ta_engine.loader import load_candles

logger = logging.getLogger("agents.service")

PAIRS = ["EUR_USD", "GBP_USD", "USD_JPY", "AUD_USD", "USD_CAD"]


async def _load_cross_returns(pairs: list[str], limit: int = 60) -> dict:
    """Recent H1 log-returns per pair, for the cross-rate and risk-sentiment
    agents."""
    cross: dict = {}
    for p in pairs:
        df = await load_candles(p, "H1", limit=limit)
        if len(df) >= 5:
            closes = df["c"].to_numpy(dtype=float)
            cross[p] = np.diff(np.log(closes))
    return cross


async def _load_calendar(hours_ahead: int = 48, hours_back: int = 6) -> list[dict]:
    now = datetime.now(timezone.utc)
    lo, hi = now - timedelta(hours=hours_back), now + timedelta(hours=hours_ahead)
    async with get_session() as session:
        result = await session.execute(
            text("""
                SELECT ts, currency, impact, title, actual, forecast, previous
                FROM calendar_events WHERE ts BETWEEN :lo AND :hi ORDER BY ts
            """),
            {"lo": lo, "hi": hi},
        )
        rows = result.fetchall()
    return [
        {"ts": r[0], "currency": r[1], "impact": r[2], "title": r[3],
         "actual": r[4], "forecast": r[5], "previous": r[6]}
        for r in rows
    ]


async def analyze_pair(pair: str, coordinator: StrategyCoordinator,
                       cross: dict, calendar: list[dict],
                       timeframe: str = "H1", horizon: int = 1,
                       limit: int = 500, log: bool = True) -> dict:
    df = await load_candles(pair, timeframe, limit=limit)
    if df.empty:
        return {"pair": pair, "action": "hold", "error": "no_data"}

    ctx = build_context_from_window(df, pair, timeframe, horizon)
    ctx.cross = {k: v for k, v in cross.items() if k != pair}
    ctx.calendar = calendar

    rec = coordinator.recommend(ctx)
    payload = rec.to_dict()
    if log:
        log_decision(payload)
    return payload


async def analyze_all(pairs: list[str] | None = None, timeframe: str = "H1",
                      horizon: int = 1, log: bool = True) -> list[dict]:
    pairs = pairs or PAIRS
    coordinator = StrategyCoordinator()
    cross = await _load_cross_returns(pairs)
    calendar = await _load_calendar()
    logger.info("loaded cross returns for %d pairs, %d upcoming calendar events",
                len(cross), len(calendar))

    out = []
    for pair in pairs:
        try:
            out.append(await analyze_pair(pair, coordinator, cross, calendar,
                                          timeframe, horizon, log=log))
        except Exception:
            logger.exception("analysis failed for %s", pair)
            out.append({"pair": pair, "action": "hold", "error": "exception"})
    return out


async def _main():
    recs = await analyze_all()
    for r in recs:
        summary = {k: r.get(k) for k in
                   ("pair", "action", "confidence", "disagreement", "gates", "rationale")}
        print(json.dumps(summary, indent=2, default=str))


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(_main())
