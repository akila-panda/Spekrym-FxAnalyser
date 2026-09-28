"""Backtest strategy that runs the full multi-agent Strategy Coordinator on
each bar and trades its recommendation.

This is the profitability proof for Phase 4: replaying the *whole* reasoning
layer (forecast + price-action + volatility gating + confidence-scaled sizing)
through the Phase 2 engine, on the same out-of-sample holdout the raw-forecast
strategy used, so the two are directly comparable. If the coordinator improves
return or drawdown over the raw forecast, the integration is earning its keep.

Note: in a single-pair backtest the cross-rate, risk-sentiment and calendar
agents abstain (no cross-pair / historical-event data at each bar), so this
measures the technical tree + risk gates. Those live-only agents are exercised
by agents/service.py.
"""
from __future__ import annotations

from agents.base import build_context_from_window
from agents.coordinator import StrategyCoordinator

MIN_CANDLES = 260  # matches forecast feature warmup


def make_strategy(pair: str, timeframe: str = "H1", horizon: int = 1,
                  coordinator: StrategyCoordinator | None = None):
    """Return a strategy_fn closure bound to a pair/model and coordinator
    config, matching the engine's Callable[[DataFrame], Optional[dict]]."""
    coord = coordinator or StrategyCoordinator()

    def strategy_fn(window_df):
        if len(window_df) < MIN_CANDLES:
            return None
        ctx = build_context_from_window(window_df, pair, timeframe, horizon)
        if ctx.forecast is None:
            return None  # no model / insufficient warmup -> no trade
        rec = coord.recommend(ctx)
        return rec.to_signal()

    return strategy_fn
