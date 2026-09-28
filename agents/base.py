"""Shared types and market-context assembly for the multi-agent layer.

Design note (deliberate deviation from a literal LLM "swarm"): every agent
here is a *deterministic* function of a MarketContext. That is what lets the
whole reasoning layer be replayed bar-by-bar through the Phase 2 backtest
engine, so a recommendation's confidence can be *measured* against realized
outcomes rather than asserted -- exactly what 01-overview.md's "confidence
must be earned" and "backtestable by default" principles require. An LLM can
be layered on top purely to narrate the rationale (see agents/narrator.py);
it never makes the decision.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum

import pandas as pd


class Bias(str, Enum):
    LONG = "long"
    SHORT = "short"
    NEUTRAL = "neutral"

    @property
    def sign(self) -> int:
        return {Bias.LONG: 1, Bias.SHORT: -1, Bias.NEUTRAL: 0}[self]


def bias_from_sign(x: float, deadzone: float = 1e-9) -> Bias:
    if x > deadzone:
        return Bias.LONG
    if x < -deadzone:
        return Bias.SHORT
    return Bias.NEUTRAL


@dataclass
class AgentVerdict:
    """One agent's opinion. `confidence` is the strength of the view in [0, 1].
    `abstain=True` means the agent had no applicable input (e.g. no cross-pair
    data in a single-pair backtest) and must be excluded from aggregation
    rather than counted as a neutral vote."""
    agent: str
    bias: Bias
    confidence: float
    rationale: str
    signals: dict = field(default_factory=dict)
    abstain: bool = False

    @property
    def signed(self) -> float:
        """Directional contribution in [-1, 1]."""
        if self.abstain:
            return 0.0
        return self.bias.sign * max(0.0, min(1.0, self.confidence))

    def to_dict(self) -> dict:
        return {
            "agent": self.agent,
            "bias": self.bias.value,
            "confidence": round(self.confidence, 4),
            "abstain": self.abstain,
            "rationale": self.rationale,
            "signals": self.signals,
        }


@dataclass
class TreeVerdict:
    """Aggregate opinion of one tree of agents."""
    tree: str
    bias: Bias
    confidence: float
    members: list[AgentVerdict]
    rationale: str

    @property
    def signed(self) -> float:
        return self.bias.sign * max(0.0, min(1.0, self.confidence))

    def to_dict(self) -> dict:
        return {
            "tree": self.tree,
            "bias": self.bias.value,
            "confidence": round(self.confidence, 4),
            "rationale": self.rationale,
            "members": [m.to_dict() for m in self.members],
        }


def aggregate(tree: str, members: list[AgentVerdict],
              weights: dict[str, float] | None = None) -> TreeVerdict:
    """Combine member verdicts into a tree verdict.

    Non-abstaining members are combined as a weighted mean of their signed
    scores; the tree's confidence is the magnitude of that mean, damped by the
    fraction of members that actually spoke (so a tree where most agents
    abstained is not over-trusted).
    """
    active = [m for m in members if not m.abstain]
    if not active:
        return TreeVerdict(tree, Bias.NEUTRAL, 0.0, members,
                           f"{tree}: no active agents")

    weights = weights or {}
    wsum = sum(weights.get(m.agent, 1.0) for m in active)
    signed = sum(weights.get(m.agent, 1.0) * m.signed for m in active) / (wsum or 1.0)

    # Confidence is the weighted conviction of the agents that actually spoke.
    # We deliberately do NOT damp by (active / total): some members (e.g. the
    # VolatilityAgent, or the cross-rate agent in a single-pair run) abstain by
    # design, and penalizing the tree for their structural silence would gate
    # out every otherwise-valid signal.
    bias = bias_from_sign(signed)
    confidence = abs(signed)

    agreeing = [m.agent for m in active if m.bias == bias and bias != Bias.NEUTRAL]
    dissenting = [m.agent for m in active
                  if m.bias != Bias.NEUTRAL and m.bias != bias]
    rationale = (f"{tree} -> {bias.value} (conf {confidence:.2f}); "
                 f"agree: {agreeing or '-'}; dissent: {dissenting or '-'}")
    return TreeVerdict(tree, bias, confidence, members, rationale)


@dataclass
class MarketContext:
    """Everything the agents need for one pair at one point in time. Built
    causally (only data up to `as_of`), so it is identical in backtest and
    live use -- the guarantee that makes replay meaningful."""
    pair: str
    timeframe: str
    as_of: str
    price: float
    facts: dict                         # ta_engine.build_facts output
    forecast: dict | None = None        # ForecastModel.predict_distribution output
    atr: float | None = None
    cross: dict = field(default_factory=dict)      # {other_pair: recent log-returns Series}
    calendar: list[dict] = field(default_factory=list)  # upcoming events
    higher_tf: dict | None = None       # optional higher-timeframe facts

    @property
    def indicators(self) -> dict:
        return self.facts.get("indicators", {}) or {}

    @property
    def smc(self) -> dict:
        return self.facts.get("smc", {}) or {}

    @property
    def price_action(self) -> list:
        return self.facts.get("price_action", []) or []

    @property
    def support_resistance(self) -> dict:
        return self.facts.get("support_resistance", {}) or {}


def _atr_from_facts_or_window(facts: dict, window_df: pd.DataFrame) -> float | None:
    ind = (facts.get("indicators") or {})
    atr = ind.get("atr14")
    if isinstance(atr, (int, float)):
        return float(atr)
    if len(window_df) >= 15:
        tr = (window_df["h"] - window_df["l"]).tail(14).mean()
        return float(tr) if pd.notna(tr) else None
    return None


def build_context_from_window(window_df: pd.DataFrame, pair: str,
                              timeframe: str = "H1", horizon: int = 1,
                              with_forecast: bool = True) -> MarketContext:
    """Assemble a MarketContext from a causal OHLCV slice ending at the current
    (just-closed) candle. Used by the backtest strategy, so cross-pair /
    calendar inputs are left empty here (those agents then abstain); the live
    service (agents/service.py) fills them in."""
    from ta_engine.facts import build_facts

    facts = build_facts(pair, timeframe, window_df)
    price = float(window_df["c"].iloc[-1])
    as_of = str(window_df["ts"].iloc[-1]) if "ts" in window_df.columns else ""
    atr = _atr_from_facts_or_window(facts, window_df)

    forecast = None
    if with_forecast:
        from forecast.predict import predict_from_window
        forecast = predict_from_window(window_df, pair, timeframe, horizon)

    return MarketContext(pair=pair, timeframe=timeframe, as_of=as_of, price=price,
                         facts=facts, forecast=forecast, atr=atr)
