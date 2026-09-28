"""Sentiment Analysis Tree.

No paid sentiment/positioning feed is wired yet, so instead of faking one this
tree derives a *risk-on / risk-off* regime from the price action of the FX
majors themselves -- a real, computable cross-asset proxy:

    risk-on  = commodity/high-beta currencies bid (AUD up) and the safe-haven
               yen offered (USD_JPY up = yen weak)
    risk-off = the reverse

That regime is then mapped onto the target pair through a per-pair beta (how
that pair typically behaves in risk-on). Agents abstain when the cross-pair
return data they need is not present (e.g. a single-pair backtest).
"""
from __future__ import annotations

import numpy as np

from agents.base import AgentVerdict, TreeVerdict, Bias, aggregate, bias_from_sign, MarketContext

# contribution of each pair's recent return to a market-wide risk-on index
RISK_INDEX_WEIGHTS = {
    "AUD_USD": 1.0,    # risk-on currency vs USD
    "USD_JPY": 0.8,    # up = yen weak = risk-on
    "USD_CAD": -0.9,   # up = CAD weak = risk-off
    "EUR_USD": 0.3,
    "GBP_USD": 0.3,
}

# how each tradable pair tends to move when risk is ON
PAIR_RISK_BETA = {
    "AUD_USD": 1.0,
    "USD_JPY": 0.8,
    "USD_CAD": -0.9,
    "EUR_USD": 0.3,
    "GBP_USD": 0.3,
}


def market_risk_index(cross: dict, lookback: int = 12) -> float | None:
    """Weighted, bounded risk-on index in [-1, 1] from recent per-pair returns.
    `cross` maps pair -> a sequence of recent log returns. Returns None if no
    constituent series are available."""
    total, wsum = 0.0, 0.0
    for pair, w in RISK_INDEX_WEIGHTS.items():
        series = cross.get(pair)
        if series is None or len(series) < 5:
            continue
        mom = float(np.sum(series[-lookback:]))
        total += w * mom
        wsum += abs(w)
    if wsum == 0:
        return None
    return float(np.tanh((total / wsum) * 200))


class RiskSentimentAgent:
    name = "RiskSentimentAgent"

    def evaluate(self, ctx: MarketContext) -> AgentVerdict:
        idx = market_risk_index(ctx.cross)
        if idx is None:
            return AgentVerdict(self.name, Bias.NEUTRAL, 0.0,
                                "no cross-asset data for risk proxy", abstain=True)
        beta = PAIR_RISK_BETA.get(ctx.pair, 0.0)
        score = idx * beta
        bias = bias_from_sign(score) if abs(score) >= 0.1 else Bias.NEUTRAL
        confidence = float(min(1.0, abs(score)))
        regime = "risk-on" if idx > 0.1 else "risk-off" if idx < -0.1 else "neutral"
        return AgentVerdict(
            self.name, bias, confidence,
            f"{regime} regime (index {idx:+.2f}), pair beta {beta:+.1f}",
            signals={"risk_index": idx, "regime": regime, "beta": beta},
        )


class PositioningAgent:
    """Retail/institutional positioning (e.g. COT) needs a feed the project
    does not have yet. Abstains rather than guessing."""
    name = "PositioningAgent"

    def evaluate(self, ctx: MarketContext) -> AgentVerdict:
        return AgentVerdict(self.name, Bias.NEUTRAL, 0.0,
                            "no positioning feed connected", abstain=True)


class NewsSentimentAgent:
    """Aggregate headline sentiment needs a news feed the project does not have
    yet. Abstains rather than inventing a score."""
    name = "NewsSentimentAgent"

    def evaluate(self, ctx: MarketContext) -> AgentVerdict:
        return AgentVerdict(self.name, Bias.NEUTRAL, 0.0,
                            "no news feed connected", abstain=True)


class SentimentTree:
    name = "sentiment"

    def __init__(self):
        self.agents = [RiskSentimentAgent(), NewsSentimentAgent(), PositioningAgent()]

    def evaluate(self, ctx: MarketContext) -> TreeVerdict:
        verdicts = [a.evaluate(ctx) for a in self.agents]
        return aggregate(self.name, verdicts)
