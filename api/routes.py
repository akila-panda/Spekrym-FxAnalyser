from __future__ import annotations

import uuid
from typing import Optional

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Query, Request

from api.datasource import CandleSource
from api.schemas import (Bound, BoundsResponse, Candle, CandlesResponse, Pair, ScanRequest,
                         ScanResult, StrategyInfo, Summary, Timeframe)
from api.strategies.base import ParamError, validate_params
from api.strategies.registry import all_strategies, get_strategy

router = APIRouter(prefix="/api")

MAX_CANDLES = 20_000
MAX_SCAN_DAYS = 400


def get_source(request: Request) -> CandleSource:
    return request.app.state.source


def _ts(v) -> Optional[pd.Timestamp]:
    if v is None:
        return None
    t = pd.Timestamp(v)
    return t.tz_localize("UTC") if t.tzinfo is None else t.tz_convert("UTC")


@router.get("/strategies", response_model=list[StrategyInfo])
async def strategies():
    return [s.info for s in all_strategies()]


@router.get("/bounds", response_model=BoundsResponse)
async def bounds(pair: Pair, source: CandleSource = Depends(get_source)):
    b = await source.bounds(pair)
    return BoundsResponse(pair=pair, bounds={
        tf: Bound(first=a.isoformat(sep=" ") if a is not None else None,
                  last=z.isoformat(sep=" ") if z is not None else None)
        for tf, (a, z) in b.items()})


@router.get("/candles", response_model=CandlesResponse)
async def candles(pair: Pair, tf: Timeframe,
                  from_: Optional[str] = Query(None, alias="from"), to: Optional[str] = None,
                  before: Optional[str] = None,
                  limit: int = Query(5000, ge=1, le=MAX_CANDLES),
                  source: CandleSource = Depends(get_source)):
    try:
        df = await source.candles(pair, tf, _ts(from_), _ts(to), _ts(before), limit)
    except ValueError as e:
        raise HTTPException(422, str(e))
    return CandlesResponse(pair=pair, tf=tf, candles=[
        Candle(t=r.ts.isoformat(sep=" "), o=r.o, h=r.h, l=r.l, c=r.c, v=r.v)
        for r in df.itertuples()])


@router.post("/scan", response_model=ScanResult, response_model_by_alias=True)
async def scan(req: ScanRequest, source: CandleSource = Depends(get_source)):
    strat = get_strategy(req.strategy_id)
    if strat is None:
        raise HTTPException(404, f"unknown strategy: {req.strategy_id}")
    if req.timeframe not in strat.info.supported_timeframes:
        raise HTTPException(422, f"{strat.info.name} does not support {req.timeframe}")
    if req.end < req.start:
        raise HTTPException(422, "'to' is before 'from'")
    if (req.end - req.start).days > MAX_SCAN_DAYS:
        raise HTTPException(422, f"range exceeds {MAX_SCAN_DAYS} days")
    try:
        params = validate_params(strat.info.params, req.params)
    except ParamError as e:
        raise HTTPException(422, str(e))

    lo = pd.Timestamp(req.start) - pd.Timedelta(days=2)   # lookback for prior-day levels / volume
    hi = pd.Timestamp(req.end) + pd.Timedelta(days=1)
    df = await source.candles(req.pair, req.timeframe, lo, hi, None, MAX_CANDLES * 5)
    try:
        setups = strat.scan(req.pair, req.timeframe, df, pd.Timestamp(req.start),
                            pd.Timestamp(req.end), params)
    except ParamError as e:
        raise HTTPException(422, str(e))

    valid = [s for s in setups if s.status == "valid"]
    rs = [s.outcome.r_multiple for s in valid]
    wins = [r for r in rs if r > 0]
    losses = [r for r in rs if r < 0]
    n = len(valid)
    summary = Summary(
        n_valid=n, n_rejected=len(setups) - n, n_wins=len(wins), n_losses=len(losses),
        win_rate=round(len(wins) / n, 4) if n else None,
        expectancy_r=round(sum(rs) / n, 4) if n else None,
        avg_win_r=round(sum(wins) / len(wins), 4) if wins else None,
        avg_loss_r=round(sum(losses) / len(losses), 4) if losses else None,
        cost_pips_assumed=strat.cost_pips)
    warnings = ["Exploratory scan: in-sample, not validated by the Judge."]
    if df.empty:
        warnings.append("No candles found for this window.")
    if 0 < n < 30:
        warnings.append(f"Only {n} setups: too few to read anything into.")
    return ScanResult(scan_id=uuid.uuid4().hex[:12], timeframe=req.timeframe, strategy=strat.info,
                      params_used=params, setups=setups, summary=summary, warnings=warnings)