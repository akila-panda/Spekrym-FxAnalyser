"""Fundamental Analysis Tree (economic calendar driven).

With only an economic-calendar feed wired in Phase 0 (no news/sentiment API
yet), this tree's main value is *risk-first*: it flags an imminent high-impact
release as a trade blackout, and reads a released surprise as a light
directional nudge. Agents abstain when no calendar data is present (e.g. a
historical backtest with no event history for that timestamp), so they never
fabricate a view.
"""
from __future__ import annotations

from datetime import datetime, timezone

from agents.base import AgentVerdict, TreeVerdict, Bias, aggregate, bias_from_sign, MarketContext
from risk.currency import split_pair

HIGH_IMPACT = {"High", "high", "HIGH"}
CB_KEYWORDS = ("rate decision", "interest rate", "fomc", "monetary policy",
               "cash rate", "official bank rate", "press conference")


def _parse_ts(value) -> datetime | None:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None


def _parse_number(s) -> float | None:
    """Parse '0.3%', '1.2M', '250K', '-0.1%' -> float. Returns None if not
    numeric."""
    if s is None:
        return None
    txt = str(s).strip().replace("%", "").replace(",", "")
    mult = 1.0
    if txt[-1:] in ("K", "k"):
        mult, txt = 1e3, txt[:-1]
    elif txt[-1:] in ("M", "m"):
        mult, txt = 1e6, txt[:-1]
    elif txt[-1:] in ("B", "b"):
        mult, txt = 1e9, txt[:-1]
    try:
        return float(txt) * mult
    except ValueError:
        return None


def _pair_currencies(pair: str) -> set[str]:
    base, quote = split_pair(pair)
    return {base, quote}


class EconomicCalendarAgent:
    """Blackout on imminent high-impact events; light directional read on a
    fresh surprise (actual vs forecast)."""
    name = "EconomicCalendarAgent"

    def __init__(self, blackout_hours: float = 2.0, fresh_hours: float = 3.0):
        self.blackout_hours = blackout_hours
        self.fresh_hours = fresh_hours

    def evaluate(self, ctx: MarketContext) -> AgentVerdict:
        if not ctx.calendar:
            return AgentVerdict(self.name, Bias.NEUTRAL, 0.0,
                                "no calendar data", abstain=True,
                                signals={"blackout": False})

        now = _parse_ts(ctx.as_of) or datetime.now(timezone.utc)
        ccys = _pair_currencies(ctx.pair)

        blackout = None
        surprise_votes = []  # (label, signed strength)
        for ev in ctx.calendar:
            if ev.get("currency") not in ccys:
                continue
            if ev.get("impact") not in HIGH_IMPACT:
                continue
            ets = _parse_ts(ev.get("ts"))
            if ets is None:
                continue
            delta_h = (ets - now).total_seconds() / 3600.0

            # imminent event -> blackout
            if 0 <= delta_h <= self.blackout_hours:
                blackout = ev
            # freshly released -> directional surprise
            if -self.fresh_hours <= delta_h < 0:
                actual = _parse_number(ev.get("actual"))
                forecast = _parse_number(ev.get("forecast"))
                if actual is not None and forecast is not None and forecast != 0:
                    surprise = (actual - forecast) / abs(forecast)
                    # assumption: higher-than-forecast => stronger currency
                    # (holds for the majority: GDP, CPI, PMI, NFP, retail sales)
                    ccy_strength = max(-1.0, min(1.0, surprise))
                    base, quote = split_pair(ctx.pair)
                    if ev["currency"] == base:
                        surprise_votes.append((ev.get("title", ""), ccy_strength))
                    elif ev["currency"] == quote:
                        surprise_votes.append((ev.get("title", ""), -ccy_strength))

        if blackout is not None:
            return AgentVerdict(
                self.name, Bias.NEUTRAL, 0.0,
                f"blackout: high-impact {blackout.get('currency')} "
                f"'{blackout.get('title')}' within {self.blackout_hours}h",
                abstain=True,
                signals={"blackout": True, "event": blackout.get("title")},
            )

        if surprise_votes:
            score = sum(v for _, v in surprise_votes) / len(surprise_votes)
            bias = bias_from_sign(score) if abs(score) >= 0.1 else Bias.NEUTRAL
            confidence = float(min(1.0, abs(score)))
            titles = ", ".join(t for t, _ in surprise_votes)
            return AgentVerdict(self.name, bias, confidence,
                                f"fresh surprise on: {titles}",
                                signals={"blackout": False, "surprise": score})

        return AgentVerdict(self.name, Bias.NEUTRAL, 0.0,
                            "no relevant high-impact events", abstain=True,
                            signals={"blackout": False})


class CentralBankAgent:
    """Flags an imminent central-bank event as elevated caution. Directionally
    neutral (a rate decision's direction needs the actual, handled above)."""
    name = "CentralBankAgent"

    def __init__(self, window_hours: float = 12.0):
        self.window_hours = window_hours

    def evaluate(self, ctx: MarketContext) -> AgentVerdict:
        if not ctx.calendar:
            return AgentVerdict(self.name, Bias.NEUTRAL, 0.0,
                                "no calendar data", abstain=True,
                                signals={"cb_soon": False})
        now = _parse_ts(ctx.as_of) or datetime.now(timezone.utc)
        ccys = _pair_currencies(ctx.pair)
        for ev in ctx.calendar:
            if ev.get("currency") not in ccys:
                continue
            title = (ev.get("title") or "").lower()
            if not any(k in title for k in CB_KEYWORDS):
                continue
            ets = _parse_ts(ev.get("ts"))
            if ets is None:
                continue
            delta_h = (ets - now).total_seconds() / 3600.0
            if 0 <= delta_h <= self.window_hours:
                return AgentVerdict(
                    self.name, Bias.NEUTRAL, 0.0,
                    f"central-bank event within {self.window_hours}h: "
                    f"{ev.get('currency')} '{ev.get('title')}'",
                    abstain=True, signals={"cb_soon": True})
        return AgentVerdict(self.name, Bias.NEUTRAL, 0.0,
                            "no imminent central-bank event", abstain=True,
                            signals={"cb_soon": False})


class NewsImpactAgent:
    """Placeholder until a news feed is added (Phase 0 only wired the economic
    calendar). Always abstains rather than inventing a headline read."""
    name = "NewsImpactAgent"

    def evaluate(self, ctx: MarketContext) -> AgentVerdict:
        return AgentVerdict(self.name, Bias.NEUTRAL, 0.0,
                            "no news feed connected", abstain=True)


class FundamentalTree:
    name = "fundamental"

    def __init__(self):
        self.agents = [EconomicCalendarAgent(), CentralBankAgent(), NewsImpactAgent()]

    def evaluate(self, ctx: MarketContext) -> TreeVerdict:
        verdicts = [a.evaluate(ctx) for a in self.agents]
        return aggregate(self.name, verdicts)

    @staticmethod
    def is_blackout(tree_verdict: TreeVerdict) -> bool:
        return any(m.signals.get("blackout") for m in tree_verdict.members)
