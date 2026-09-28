"""Coordinator behavior tests, including the Phase 4 exit criterion:
disagreement between trees is surfaced, not averaged away."""
from datetime import datetime, timedelta, timezone

import numpy as np

from agents.base import MarketContext, Bias
from agents.coordinator import StrategyCoordinator


def make_facts(atr=0.0010, bos=None, obs=None):
    return {
        "indicators": {"atr14": atr},
        "price_action": [],
        "support_resistance": {"support": [], "resistance": []},
        "smc": {"break_of_structure": bos or [], "order_blocks": obs or []},
    }


def fc(up, down, flat):
    top = max((("up", up), ("down", down), ("flat", flat)), key=lambda x: x[1])
    return {"distribution": {"up": up, "down": down, "flat": flat},
            "predicted_class": top[0], "confidence": top[1]}


def bullish_ctx(pair="EUR_USD", atr=0.0010):
    return MarketContext(
        pair=pair, timeframe="H1", as_of="2026-09-23T10:00:00+00:00", price=1.10,
        facts=make_facts(
            atr=atr,
            bos=[{"type": "bullish_bos", "index": 5, "broken_level": 1.09}],
            obs=[{"type": "bullish_ob", "high": 1.099, "low": 1.098, "index": 3}],
        ),
        forecast=fc(0.56, 0.19, 0.25), atr=atr,
    )


def test_strong_bullish_produces_buy():
    rec = StrategyCoordinator().recommend(bullish_ctx())
    assert rec.action == "buy"
    assert rec.confidence >= 1
    assert rec.stop_loss < rec.price < rec.take_profit
    assert rec.rationale
    sig = rec.to_signal()
    assert sig["direction"] == "long" and sig["risk_pct"] > 0


def test_schema_matches_03agents():
    d = StrategyCoordinator().recommend(bullish_ctx()).to_dict()
    for key in ("pair", "action", "confidence", "entry_points", "stop_loss",
                "take_profit", "agent_agreement", "rationale", "gates", "trees",
                "net_score", "disagreement"):
        assert key in d, f"missing {key}"
    assert set(d["agent_agreement"]) == {"technical", "fundamental", "sentiment"}


def test_news_blackout_forces_hold():
    now = datetime(2026, 9, 23, 10, tzinfo=timezone.utc)
    ctx = bullish_ctx()
    ctx.as_of = now.isoformat()
    ctx.calendar = [{
        "ts": (now + timedelta(hours=1)).isoformat(), "currency": "USD",
        "impact": "High", "title": "FOMC", "actual": None, "forecast": None,
        "previous": None,
    }]
    rec = StrategyCoordinator().recommend(ctx)
    assert rec.action == "hold"
    assert "news_blackout" in rec.gates
    assert rec.to_signal() is None


def test_dead_volatility_vetoes():
    rec = StrategyCoordinator().recommend(bullish_ctx(atr=0.00005))
    assert rec.action == "hold"
    assert "dead_volatility" in rec.gates


def test_neutral_forecast_holds():
    ctx = MarketContext(
        pair="EUR_USD", timeframe="H1", as_of="2026-09-23T10:00:00+00:00",
        price=1.10, facts=make_facts(), forecast=fc(0.34, 0.33, 0.33), atr=0.0010,
    )
    rec = StrategyCoordinator().recommend(ctx)
    assert rec.action == "hold"


def test_disagreement_is_surfaced_not_averaged():
    # technical bullish (forecast + price action) but sentiment risk-off (short)
    ctx = bullish_ctx()
    ctx.cross = {"USD_CAD": np.full(20, 0.001)}  # risk-off -> EUR_USD bearish sentiment
    rec = StrategyCoordinator().recommend(ctx)
    assert rec.agent_agreement["technical"] == "bullish"
    assert rec.agent_agreement["sentiment"] == "bearish"
    assert rec.disagreement is True
    # net still bullish (technical outweighs), but the dissent is visible
    assert rec.action in ("buy", "hold")


def test_confidence_scaled_risk_within_band():
    coord = StrategyCoordinator(risk_min=0.5, risk_max=1.5)
    rec = coord.recommend(bullish_ctx())
    if rec.action != "hold":
        assert 0.5 <= rec.risk_pct <= 1.5


def test_weights_are_configurable():
    # kill the technical weight -> a technical-only signal should no longer act
    coord = StrategyCoordinator(tree_weights={"technical": 0.0, "fundamental": 0.5,
                                              "sentiment": 0.5})
    rec = coord.recommend(bullish_ctx())
    assert rec.action == "hold"
