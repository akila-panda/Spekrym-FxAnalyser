"""Pydantic models for the API contract. Timestamps are Python-style strings
('2025-05-07 17:00:00+00:00'); the frontend converts them in one place."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

PAIRS = ("EUR_USD", "GBP_USD", "USD_JPY", "AUD_USD", "USD_CAD")
TIMEFRAMES = ("M1", "M5", "M15", "H1", "H4")
TF_SECONDS = {"M1": 60, "M5": 300, "M15": 900, "H1": 3600, "H4": 14400}

Pair = Literal["EUR_USD", "GBP_USD", "USD_JPY", "AUD_USD", "USD_CAD"]
Timeframe = Literal["M1", "M5", "M15", "H1", "H4"]


def pip_size(pair: str) -> float:
    return 0.01 if pair.endswith("JPY") else 0.0001


# ---------- market data ----------
class Candle(BaseModel):
    t: str
    o: float
    h: float
    l: float
    c: float
    v: float


class CandlesResponse(BaseModel):
    pair: str
    tf: str
    candles: list[Candle]


class Bound(BaseModel):
    first: Optional[str] = None
    last: Optional[str] = None


class BoundsResponse(BaseModel):
    pair: str
    bounds: dict[str, Bound]


# ---------- strategy catalog ----------
class ParamSpec(BaseModel):
    key: str
    label: str
    type: Literal["number", "integer", "boolean", "select", "time"]
    default: Any
    min: Optional[float] = None
    max: Optional[float] = None
    step: Optional[float] = None
    options: Optional[list[str]] = None
    help: Optional[str] = None


class StrategyInfo(BaseModel):
    id: str
    name: str
    description: str
    supported_timeframes: list[Timeframe]
    context_timeframes: list[Timeframe]
    display_tz: str
    params: list[ParamSpec]


# ---------- annotations ----------
class Point(BaseModel):
    t: str
    p: float


class Annotation(BaseModel):
    id: str
    kind: Literal["level", "zone", "window", "line", "polyline", "marker", "trade", "text"]
    role: str
    tone: Literal["bull", "bear", "neutral", "info"] = "neutral"
    source_tf: Timeframe
    step: int = 0                      # 0 = context, always shown
    known_at: str
    label: Optional[str] = None
    why: Optional[str] = None
    emphasis: Literal["faint", "normal", "strong"] = "normal"
    flow: Optional[Literal["down", "local", "all"]] = None
    visible_on: Optional[list[Timeframe]] = None
    # geometry (kind-specific)
    t0: Optional[str] = None
    t1: Optional[str] = None
    price: Optional[float] = None      # level / marker
    p_high: Optional[float] = None     # zone
    p_low: Optional[float] = None
    points: Optional[list[Point]] = None
    shape: Optional[Literal["arrow_up", "arrow_down", "circle"]] = None
    # trade
    direction: Optional[Literal["long", "short"]] = None
    entry: Optional[float] = None
    stop: Optional[float] = None
    target: Optional[float] = None
    exit_time: Optional[str] = None
    exit_price: Optional[float] = None


class Step(BaseModel):
    n: int
    label: str
    known_at: str


class Condition(BaseModel):
    key: str
    label: str
    passed: Optional[bool]             # None = not applicable
    detail: str = ""


class Outcome(BaseModel):
    result: Literal["win", "loss", "flat"]
    r_multiple: float
    net_pips: float
    cost_pips: float
    exit_reason: str
    bars_held: int


class Focus(BaseModel):
    start: str = Field(serialization_alias="from")
    end: str = Field(serialization_alias="to")
    model_config = ConfigDict(populate_by_name=True)


class Setup(BaseModel):
    id: str
    status: Literal["valid", "rejected"]
    direction: Optional[Literal["long", "short"]] = None
    date: str
    focus: Focus
    steps: list[Step]
    conditions: list[Condition]
    annotations: list[Annotation]
    outcome: Optional[Outcome] = None


class Summary(BaseModel):
    n_valid: int
    n_rejected: int
    n_wins: int
    n_losses: int
    win_rate: Optional[float]
    expectancy_r: Optional[float]
    avg_win_r: Optional[float]
    avg_loss_r: Optional[float]
    cost_pips_assumed: float


class ScanResult(BaseModel):
    scan_id: str
    timeframe: Timeframe
    strategy: StrategyInfo
    params_used: dict[str, Any]
    setups: list[Setup]
    summary: Summary
    warnings: list[str]


class ScanRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    strategy_id: str
    pair: Pair
    timeframe: Timeframe
    start: datetime = Field(alias="from")
    end: datetime = Field(alias="to")
    params: dict[str, Any] = Field(default_factory=dict)

    @field_validator("start", "end")
    @classmethod
    def _utc(cls, v: datetime) -> datetime:
        return v.replace(tzinfo=timezone.utc) if v.tzinfo is None else v.astimezone(timezone.utc)