"""Strategy plugin contract. A strategy is data (StrategyInfo) plus `scan`."""
from __future__ import annotations

from typing import Any, Protocol

import pandas as pd

from api.schemas import ParamSpec, Setup, StrategyInfo


class ParamError(ValueError):
    pass


class Strategy(Protocol):
    info: StrategyInfo
    cost_pips: float

    def scan(self, pair: str, tf: str, df: pd.DataFrame, start: pd.Timestamp,
             end: pd.Timestamp, params: dict[str, Any]) -> list[Setup]: ...


def validate_params(specs: list[ParamSpec], given: dict[str, Any]) -> dict[str, Any]:
    known = {s.key: s for s in specs}
    extra = set(given) - set(known)
    if extra:
        raise ParamError(f"unknown params: {sorted(extra)}")
    out: dict[str, Any] = {}
    for key, s in known.items():
        v = given.get(key, s.default)
        if s.type == "boolean":
            if not isinstance(v, bool):
                raise ParamError(f"{key}: expected boolean")
        elif s.type in ("number", "integer"):
            if isinstance(v, bool) or not isinstance(v, (int, float)):
                raise ParamError(f"{key}: expected number")
            if s.type == "integer" and float(v) != int(v):
                raise ParamError(f"{key}: expected integer")
            if (s.min is not None and v < s.min) or (s.max is not None and v > s.max):
                raise ParamError(f"{key}: must be within [{s.min}, {s.max}]")
            v = int(v) if s.type == "integer" else float(v)
        elif s.type == "select":
            if v not in (s.options or []):
                raise ParamError(f"{key}: must be one of {s.options}")
        elif s.type == "time":
            try:
                h, m = str(v).split(":")
                assert 0 <= int(h) < 24 and 0 <= int(m) < 60
            except Exception:
                raise ParamError(f"{key}: expected HH:MM")
        out[key] = v
    return out