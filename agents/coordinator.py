"""Strategy Coordinator.

Synthesizes the three agent trees into one explainable recommendation. Per
03-agents.md it *weighs* (not averages), *surfaces disagreement* explicitly,
and is *risk-first* -- hard gates (news blackout, dead volatility, weak
conviction) can veto a trade regardless of the directional score. Confidence
is derived from conviction x agreement, and position size scales with it, so a
marginal setup risks less than a high-agreement one.

The output matches the 03-agents.md schema (action / confidence / entry /
stop_loss / take_profit / agent_agreement / rationale) with extra fields for
full auditability (per-tree verdicts, gates fired, numeric net score).
"""
from __future__ import annotations

from dataclasses import dataclass, field

from agents.base import Bias, TreeVerdict, bias_from_sign, MarketContext
from agents.technical_tree import TechnicalTree
from agents.fundamental_tree import FundamentalTree
from agents.sentiment_tree import SentimentTree
from agents import narrator
from risk.stops import take_profit

DEFAULT_TREE_WEIGHTS = {"technical": 0.60, "fundamental": 0.25, "sentiment": 0.15}

_BIAS_WORD = {Bias.LONG: "bullish", Bias.SHORT: "bearish", Bias.NEUTRAL: "neutral"}


@dataclass
class Recommendation:
    pair: str
    timeframe: str
    as_of: str
    price: float
    action: str            # "buy" | "sell" | "hold"
    confidence: int        # 0..10 (0 when holding)
    net_score: float
    agent_agreement: dict
    disagreement: bool
    gates: list[str]
    rationale: str
    trees: list[TreeVerdict] = field(default_factory=list)
    entry_points: list[float] = field(default_factory=list)
    stop_loss: float | None = None
    take_profit: float | None = None
    risk_pct: float = 0.0
    _reference_level: float | None = None

    def to_dict(self) -> dict:
        return {
            "pair": self.pair,
            "timeframe": self.timeframe,
            "as_of": self.as_of,
            "price": round(self.price, 6),
            "action": self.action,
            "confidence": self.confidence,
            "entry_points": [round(p, 6) for p in self.entry_points],
            "stop_loss": round(self.stop_loss, 6) if self.stop_loss is not None else None,
            "take_profit": round(self.take_profit, 6) if self.take_profit is not None else None,
            "risk_pct": round(self.risk_pct, 3),
            "net_score": round(self.net_score, 4),
            "disagreement": self.disagreement,
            "agent_agreement": self.agent_agreement,
            "gates": self.gates,
            "rationale": self.rationale,
            "trees": [t.to_dict() for t in self.trees],
        }

    def to_signal(self) -> dict | None:
        """Adapter for the Phase 2 backtest engine. Returns None when holding
        so no position is opened; otherwise a signal carrying the SMC reference
        level (engine derives the stop from it) and confidence-scaled risk."""
        if self.action == "hold":
            return None
        direction = "long" if self.action == "buy" else "short"
        sig = {"direction": direction, "risk_pct": self.risk_pct,
               "reason": f"coordinator {self.action} conf={self.confidence}"}
        if self._reference_level is not None:
            key = "reference_low" if direction == "long" else "reference_high"
            sig[key] = self._reference_level
        return sig


class StrategyCoordinator:
    def __init__(self, tree_weights: dict | None = None, min_net: float = 0.12,
                 min_confidence: int = 3, atr_mult: float = 1.5, rr: float = 2.0,
                 risk_min: float = 0.5, risk_max: float = 1.5,
                 veto_dead_vol: bool = True):
        self.tree_weights = tree_weights or dict(DEFAULT_TREE_WEIGHTS)
        self.min_net = min_net
        self.min_confidence = min_confidence
        self.atr_mult = atr_mult
        self.rr = rr
        self.risk_min = risk_min
        self.risk_max = risk_max
        self.veto_dead_vol = veto_dead_vol
        self.technical = TechnicalTree()
        self.fundamental = FundamentalTree()
        self.sentiment = SentimentTree()

    def recommend(self, ctx: MarketContext) -> Recommendation:
        tv = self.technical.evaluate(ctx)
        fv = self.fundamental.evaluate(ctx)
        sv = self.sentiment.evaluate(ctx)
        trees = {"technical": tv, "fundamental": fv, "sentiment": sv}

        # Net score is a weight-normalized blend over the trees that actually
        # hold a directional view. Renormalizing over contributors (rather than
        # all three trees) means a technical-only signal trades at full
        # conviction instead of being diluted by trees that abstain -- which is
        # every non-technical tree in a single-pair backtest. Trees still only
        # *add* conviction when they have a view; the risk gates below are what
        # keep this conservative.
        nonneutral = [v for v in trees.values() if v.bias != Bias.NEUTRAL]
        total_w = sum(self.tree_weights.get(v.tree, 0.0) for v in nonneutral)
        net = (sum(self.tree_weights.get(v.tree, 0.0) * v.signed
                   for v in nonneutral) / total_w) if total_w else 0.0
        net_bias = bias_from_sign(net)

        agree_w = sum(self.tree_weights.get(v.tree, 0.0)
                      for v in nonneutral if v.bias == net_bias)
        agreement_ratio = (agree_w / total_w) if total_w else 0.0
        disagreement = net_bias != Bias.NEUTRAL and any(
            v.bias != Bias.NEUTRAL and v.bias != net_bias for v in nonneutral)

        confidence = int(round(min(10.0, abs(net) * 10.0 * agreement_ratio)))
        agent_agreement = {name: _BIAS_WORD[v.bias] for name, v in trees.items()}

        # --- risk-first gates ---
        gates: list[str] = []
        if FundamentalTree.is_blackout(fv):
            gates.append("news_blackout")
        regime = TechnicalTree.volatility_regime(tv).get("regime")
        if self.veto_dead_vol and regime == "dead":
            gates.append("dead_volatility")
        if net_bias == Bias.NEUTRAL:
            gates.append("no_directional_consensus")
        elif abs(net) < self.min_net:
            gates.append("below_min_conviction")
        elif confidence < self.min_confidence:
            gates.append("below_min_confidence")

        rec = Recommendation(
            pair=ctx.pair, timeframe=ctx.timeframe, as_of=ctx.as_of, price=ctx.price,
            action="hold", confidence=0, net_score=net,
            agent_agreement=agent_agreement, disagreement=disagreement,
            gates=gates, rationale="", trees=[tv, fv, sv],
        )

        if gates:
            rec.rationale = narrator.narrate(rec, held=True)
            return rec

        # --- passed gates: build the trade ---
        action = "buy" if net_bias == Bias.LONG else "sell"
        sl, tp, ref = self._levels(ctx, net_bias)
        risk_pct = self.risk_min + (self.risk_max - self.risk_min) * (confidence / 10.0)

        rec.action = action
        rec.confidence = confidence
        rec.entry_points = [round(ctx.price, 6)]
        rec.stop_loss = sl
        rec.take_profit = tp
        rec.risk_pct = risk_pct
        rec._reference_level = ref
        rec.rationale = narrator.narrate(rec, held=False)
        return rec

    def _levels(self, ctx: MarketContext, bias: Bias):
        """Stop from the nearest concordant SMC order block if one sits within
        reach, else an ATR stop. Mirrors the engine's reference handling so
        live and backtest levels agree. Returns (stop, take_profit, reference)."""
        atr = ctx.atr or (ctx.price * 0.001)
        price = ctx.price
        obs = ctx.smc.get("order_blocks") or []
        ref = None

        if bias == Bias.LONG:
            candidates = [ob["low"] for ob in obs
                          if ob["type"] == "bullish_ob" and ob["low"] < price
                          and (price - ob["low"]) <= 3 * atr]
            if candidates:
                ref = max(candidates)  # closest support below
                sl = ref - 0.1 * atr
            else:
                sl = price - atr * self.atr_mult
            sl = min(sl, price - 0.2 * atr)
            tp = take_profit(price, sl, "long", self.rr)
        else:
            candidates = [ob["high"] for ob in obs
                          if ob["type"] == "bearish_ob" and ob["high"] > price
                          and (ob["high"] - price) <= 3 * atr]
            if candidates:
                ref = min(candidates)  # closest resistance above
                sl = ref + 0.1 * atr
            else:
                sl = price + atr * self.atr_mult
            sl = max(sl, price + 0.2 * atr)
            tp = take_profit(price, sl, "short", self.rr)

        return round(sl, 6), round(tp, 6), ref
