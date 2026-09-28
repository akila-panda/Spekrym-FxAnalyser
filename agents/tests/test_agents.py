"""Unit tests for individual agents and trees (deterministic, no DB)."""
from datetime import datetime, timedelta, timezone

import numpy as np

from agents.base import MarketContext, Bias, AgentVerdict, aggregate
from agents.technical_tree import (
    ForecastAgent, PriceActionAgent, VolatilityAgent, CrossRateAgent, TechnicalTree,
)
from agents.fundamental_tree import EconomicCalendarAgent, FundamentalTree
from agents.sentiment_tree import RiskSentimentAgent, market_risk_index


def make_facts(atr=0.0010, bos=None, obs=None, pa=None, sr=None):
    return {
        "indicators": {"atr14": atr},
        "price_action": pa or [],
        "support_resistance": sr or {"support": [], "resistance": []},
        "smc": {"break_of_structure": bos or [], "order_blocks": obs or []},
    }


def make_ctx(pair="EUR_USD", price=1.10, forecast=None, **facts_kw):
    return MarketContext(
        pair=pair, timeframe="H1", as_of="2026-09-23T10:00:00+00:00",
        price=price, facts=make_facts(**facts_kw), forecast=forecast,
        atr=facts_kw.get("atr", 0.0010),
    )


def fc(up, down, flat):
    top = max((("up", up), ("down", down), ("flat", flat)), key=lambda x: x[1])
    return {"distribution": {"up": up, "down": down, "flat": flat},
            "predicted_class": top[0], "confidence": top[1]}


# --- ForecastAgent ---------------------------------------------------------

def test_forecast_agent_long():
    v = ForecastAgent().evaluate(make_ctx(forecast=fc(0.55, 0.20, 0.25)))
    assert v.bias == Bias.LONG and v.confidence > 0 and not v.abstain


def test_forecast_agent_short():
    v = ForecastAgent().evaluate(make_ctx(forecast=fc(0.18, 0.55, 0.27)))
    assert v.bias == Bias.SHORT


def test_forecast_agent_neutral_when_balanced():
    v = ForecastAgent().evaluate(make_ctx(forecast=fc(0.34, 0.33, 0.33)))
    assert v.bias == Bias.NEUTRAL


def test_forecast_agent_abstains_without_forecast():
    assert ForecastAgent().evaluate(make_ctx(forecast=None)).abstain


# --- PriceActionAgent ------------------------------------------------------

def test_price_action_bullish():
    ctx = make_ctx(
        bos=[{"type": "bullish_bos", "index": 5, "broken_level": 1.09}],
        obs=[{"type": "bullish_ob", "high": 1.099, "low": 1.098, "index": 3}],
    )
    v = PriceActionAgent().evaluate(ctx)
    assert v.bias == Bias.LONG and v.confidence > 0


def test_price_action_abstains_when_empty():
    assert PriceActionAgent().evaluate(make_ctx()).abstain


# --- VolatilityAgent -------------------------------------------------------

def test_volatility_regimes():
    assert VolatilityAgent().evaluate(make_ctx(atr=0.00005)).signals["regime"] == "dead"
    assert VolatilityAgent().evaluate(make_ctx(atr=0.0010)).signals["regime"] == "normal"
    assert VolatilityAgent().evaluate(make_ctx(atr=0.010)).signals["regime"] == "expanding"


def test_volatility_agent_always_abstains_from_direction():
    assert VolatilityAgent().evaluate(make_ctx(atr=0.0010)).abstain


# --- CrossRateAgent --------------------------------------------------------

def test_cross_rate_abstains_without_cross():
    assert CrossRateAgent().evaluate(make_ctx()).abstain


def test_cross_rate_confirms_from_reference():
    ctx = make_ctx(pair="EUR_USD")
    ctx.cross = {"GBP_USD": np.full(20, 0.0008)}  # GBP_USD rising -> EUR_USD long
    v = CrossRateAgent().evaluate(ctx)
    assert v.bias == Bias.LONG and not v.abstain


# --- EconomicCalendarAgent -------------------------------------------------

def test_calendar_blackout_on_imminent_high_impact():
    now = datetime(2026, 9, 23, 10, tzinfo=timezone.utc)
    ctx = make_ctx()
    ctx.as_of = now.isoformat()
    ctx.calendar = [{
        "ts": (now + timedelta(hours=1)).isoformat(), "currency": "USD",
        "impact": "High", "title": "FOMC Statement", "actual": None,
        "forecast": None, "previous": None,
    }]
    v = EconomicCalendarAgent().evaluate(ctx)
    assert v.signals.get("blackout") is True


def test_calendar_surprise_direction():
    now = datetime(2026, 9, 23, 10, tzinfo=timezone.utc)
    ctx = make_ctx(pair="EUR_USD")
    ctx.as_of = now.isoformat()
    # USD (quote) beat forecast -> USD stronger -> EUR_USD down (short)
    ctx.calendar = [{
        "ts": (now - timedelta(hours=1)).isoformat(), "currency": "USD",
        "impact": "High", "title": "Core CPI", "actual": "0.6%",
        "forecast": "0.3%", "previous": "0.2%",
    }]
    v = EconomicCalendarAgent().evaluate(ctx)
    assert v.bias == Bias.SHORT


def test_fundamental_tree_blackout_flag():
    now = datetime(2026, 9, 23, 10, tzinfo=timezone.utc)
    ctx = make_ctx()
    ctx.as_of = now.isoformat()
    ctx.calendar = [{
        "ts": (now + timedelta(minutes=30)).isoformat(), "currency": "USD",
        "impact": "High", "title": "NFP", "actual": None, "forecast": None,
        "previous": None,
    }]
    tv = FundamentalTree().evaluate(ctx)
    assert FundamentalTree.is_blackout(tv)


# --- Sentiment / risk index ------------------------------------------------

def test_risk_index_risk_on():
    cross = {"AUD_USD": np.full(20, 0.001), "USD_JPY": np.full(20, 0.001)}
    assert market_risk_index(cross) > 0


def test_risk_sentiment_maps_to_pair():
    ctx = make_ctx(pair="AUD_USD", price=0.66)
    ctx.cross = {"AUD_USD": np.full(20, 0.001), "USD_JPY": np.full(20, 0.001)}
    v = RiskSentimentAgent().evaluate(ctx)
    assert v.bias == Bias.LONG  # risk-on + positive AUD beta


def test_risk_sentiment_abstains_without_cross():
    assert RiskSentimentAgent().evaluate(make_ctx()).abstain


# --- aggregation -----------------------------------------------------------

def test_aggregate_all_abstain_is_neutral():
    members = [AgentVerdict("A", Bias.NEUTRAL, 0.0, "", abstain=True),
               AgentVerdict("B", Bias.NEUTRAL, 0.0, "", abstain=True)]
    tv = aggregate("t", members)
    assert tv.bias == Bias.NEUTRAL and tv.confidence == 0.0


def test_technical_tree_bullish_end_to_end():
    ctx = make_ctx(
        forecast=fc(0.55, 0.20, 0.25),
        bos=[{"type": "bullish_bos", "index": 5, "broken_level": 1.09}],
        obs=[{"type": "bullish_ob", "high": 1.099, "low": 1.098, "index": 3}],
    )
    tv = TechnicalTree().evaluate(ctx)
    assert tv.bias == Bias.LONG and tv.confidence > 0
