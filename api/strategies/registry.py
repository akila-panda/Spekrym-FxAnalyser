from __future__ import annotations

from api.strategies.orb import OrbStrategy

_STRATEGIES = {s.info.id: s for s in (OrbStrategy(),)}


def all_strategies():
    return list(_STRATEGIES.values())


def get_strategy(strategy_id: str):
    return _STRATEGIES.get(strategy_id)