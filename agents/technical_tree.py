"""Technical Analysis Tree.

Members (per 03-agents.md, with the Phase 3 forecast added as a first-class
member since it is the system's strongest measured edge):

  - ForecastAgent     : trades the direction of the ML probability distribution
  - PriceActionAgent  : SMC (BOS, order blocks), candlestick patterns, S/R
  - VolatilityAgent   : ATR regime -- a *modulator*, not a directional voter;
                        it abstains from direction but flags dead/expanding
                        regimes the coordinator uses for gating and sizing
  - CrossRateAgent    : correlated-pair confirmation/divergence (abstains when
                        no cross-pair data is present, e.g. single-pair backtest)
"""
from __future__ import annotations

import numpy as np

from agents.base import AgentVerdict, TreeVerdict, Bias, aggregate, bias_from_sign, MarketContext

# member weights inside the technical tree -- the forecast carries the most,
# since it is the only member with a measured out-of-sample edge.
TECH_WEIGHTS = {
    "ForecastAgent": 2.0,
    "PriceActionAgent": 1.3,
    "CrossRateAgent": 0.7,
    # VolatilityAgent abstains from voting, so its weight is irrelevant.
}

# correlated references available among the 5 tracked pairs; sign is the
# expected co-movement of the reference relative to the target.
CROSS_REF = {
    "EUR_USD": [("GBP_USD", 1.0)],
    "GBP_USD": [("EUR_USD", 1.0)],
    "AUD_USD": [("USD_CAD", -1.0)],
    "USD_CAD": [("AUD_USD", -1.0)],
    "USD_JPY": [],
}


class ForecastAgent:
    name = "ForecastAgent"

    def evaluate(self, ctx: MarketContext) -> AgentVerdict:
        fc = ctx.forecast
        if not fc or "distribution" not in fc:
            return AgentVerdict(self.name, Bias.NEUTRAL, 0.0,
                                "no forecast available", abstain=True)
        dist = fc["distribution"]
        p_up, p_down = float(dist.get("up", 0.0)), float(dist.get("down", 0.0))
        gap = p_up - p_down  # directional edge over the two-sided noise
        bias = bias_from_sign(gap) if abs(gap) >= 0.05 else Bias.NEUTRAL
        confidence = float(min(1.0, abs(gap) * 3.0))
        if bias == Bias.NEUTRAL:
            confidence = 0.0
        return AgentVerdict(
            self.name, bias, confidence,
            f"forecast {fc.get('predicted_class')} (up={p_up:.2f} down={p_down:.2f}, "
            f"edge={gap:+.2f})",
            signals={"distribution": dist, "raw_confidence": fc.get("confidence")},
        )


class PriceActionAgent:
    name = "PriceActionAgent"

    def evaluate(self, ctx: MarketContext) -> AgentVerdict:
        votes: list[tuple[str, float]] = []  # (label, signed weight)

        # --- break of structure: most recent event sets structural bias ---
        bos = ctx.smc.get("break_of_structure") or []
        if bos:
            last = bos[-1]
            if last["type"] == "bullish_bos":
                votes.append(("bullish_BOS", 1.0))
            elif last["type"] == "bearish_bos":
                votes.append(("bearish_BOS", -1.0))

        # --- unmitigated order block nearest to price ---
        obs = ctx.smc.get("order_blocks") or []
        price = ctx.price
        nearest = None
        for ob in obs:
            mid = (ob["high"] + ob["low"]) / 2.0
            dist = abs(price - mid)
            if nearest is None or dist < nearest[0]:
                nearest = (dist, ob)
        if nearest and ctx.atr:
            ob = nearest[1]
            # only relevant if price is within ~3 ATR of the block
            if nearest[0] <= 3 * ctx.atr:
                if ob["type"] == "bullish_ob":
                    votes.append(("bullish_OB_nearby", 0.8))
                elif ob["type"] == "bearish_ob":
                    votes.append(("bearish_OB_nearby", -0.8))

        # --- candlestick patterns in the last few candles ---
        for p in ctx.price_action[-3:]:
            name = p.get("pattern", "")
            if name.startswith("bullish"):
                votes.append((name, 0.6))
            elif name.startswith("bearish"):
                votes.append((name, -0.6))

        # --- proximity to support / resistance ---
        sr = ctx.support_resistance
        if ctx.atr:
            for zone in (sr.get("support") or [])[:3]:
                if abs(price - zone["level"]) <= 1.0 * ctx.atr:
                    votes.append(("at_support", 0.5))
                    break
            for zone in (sr.get("resistance") or [])[:3]:
                if abs(price - zone["level"]) <= 1.0 * ctx.atr:
                    votes.append(("at_resistance", -0.5))
                    break

        if not votes:
            return AgentVerdict(self.name, Bias.NEUTRAL, 0.0,
                                "no clear price-action signal", abstain=True)

        score = sum(w for _, w in votes)
        denom = sum(abs(w) for _, w in votes) or 1.0
        norm = score / denom
        bias = bias_from_sign(norm) if abs(norm) >= 0.1 else Bias.NEUTRAL
        confidence = float(min(1.0, abs(norm)))
        labels = ", ".join(l for l, _ in votes)
        return AgentVerdict(self.name, bias, confidence,
                            f"price action: {labels}",
                            signals={"votes": votes, "score": round(norm, 3)})


class VolatilityAgent:
    """Not a directional voter -- it abstains from bias but reports the ATR
    regime the coordinator uses to veto dead markets and scale position size."""
    name = "VolatilityAgent"

    def evaluate(self, ctx: MarketContext) -> AgentVerdict:
        atr = ctx.atr
        price = ctx.price
        if not atr or not price:
            return AgentVerdict(self.name, Bias.NEUTRAL, 0.0,
                                "no ATR", abstain=True,
                                signals={"regime": "unknown"})
        atr_pct = atr / price
        # thresholds tuned for FX H1 (ATR is typically ~0.05%-0.15% of price)
        if atr_pct < 0.0004:
            regime = "dead"
        elif atr_pct > 0.0025:
            regime = "expanding"
        else:
            regime = "normal"
        return AgentVerdict(
            self.name, Bias.NEUTRAL, 0.0,
            f"volatility {regime} (ATR {atr_pct*100:.3f}% of price)",
            abstain=True,
            signals={"regime": regime, "atr": atr, "atr_pct": atr_pct},
        )


class CrossRateAgent:
    name = "CrossRateAgent"

    def evaluate(self, ctx: MarketContext) -> AgentVerdict:
        refs = CROSS_REF.get(ctx.pair, [])
        if not refs or not ctx.cross:
            return AgentVerdict(self.name, Bias.NEUTRAL, 0.0,
                                "no cross-pair data", abstain=True)

        contributions = []
        for ref_pair, corr_sign in refs:
            series = ctx.cross.get(ref_pair)
            if series is None or len(series) < 5:
                continue
            ref_mom = float(np.tanh(np.sum(series[-12:]) * 200))  # bounded momentum
            # what the reference's move implies for the target, given co-movement
            implied = ref_mom * corr_sign
            contributions.append((ref_pair, implied))

        if not contributions:
            return AgentVerdict(self.name, Bias.NEUTRAL, 0.0,
                                "no usable cross series", abstain=True)

        score = sum(v for _, v in contributions) / len(contributions)
        bias = bias_from_sign(score) if abs(score) >= 0.1 else Bias.NEUTRAL
        confidence = float(min(1.0, abs(score)))
        detail = ", ".join(f"{p}:{v:+.2f}" for p, v in contributions)
        return AgentVerdict(self.name, bias, confidence,
                            f"cross-rate implied {bias.value} ({detail})",
                            signals={"contributions": contributions})


class TechnicalTree:
    name = "technical"

    def __init__(self):
        self.agents = [ForecastAgent(), PriceActionAgent(),
                       VolatilityAgent(), CrossRateAgent()]

    def evaluate(self, ctx: MarketContext) -> TreeVerdict:
        verdicts = [a.evaluate(ctx) for a in self.agents]
        return aggregate(self.name, verdicts, weights=TECH_WEIGHTS)

    @staticmethod
    def volatility_regime(tree_verdict: TreeVerdict) -> dict:
        """Pull the VolatilityAgent's regime signals out of a tree verdict."""
        for m in tree_verdict.members:
            if m.agent == "VolatilityAgent":
                return m.signals
        return {"regime": "unknown"}
