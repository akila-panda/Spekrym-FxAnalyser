"""Turns a Recommendation into a plain-English rationale.

This is the one place an LLM could legitimately be added later (it is good at
prose and bad at being a deterministic, backtestable trader). The default is a
template narrator so the system needs no API key, stays deterministic, and is
fully testable. `narrate(..., use_llm=True)` is a hook for a future swarms /
LLM call; it currently falls back to the template.
"""
from __future__ import annotations

_GATE_TEXT = {
    "news_blackout": "an imminent high-impact news release (risk-off blackout)",
    "dead_volatility": "dead volatility (no tradable range)",
    "no_directional_consensus": "no directional consensus across the trees",
    "below_min_conviction": "conviction below the minimum threshold",
    "below_min_confidence": "confidence below the minimum threshold",
}


def _tree_summary(rec) -> str:
    parts = []
    for name, verdict in rec.agent_agreement.items():
        parts.append(f"{name}={verdict}")
    return ", ".join(parts)


def _held_rationale(rec) -> str:
    reasons = [_GATE_TEXT.get(g, g) for g in rec.gates]
    reason_str = "; ".join(reasons) if reasons else "no actionable setup"
    return (f"HOLD {rec.pair}: {reason_str}. "
            f"Tree read: {_tree_summary(rec)} "
            f"(net {rec.net_score:+.2f}).")


def _trade_rationale(rec) -> str:
    side = "LONG" if rec.action == "buy" else "SHORT"
    disagree = ""
    if rec.disagreement:
        dissenters = [n for n, v in rec.agent_agreement.items()
                      if v != "neutral" and (
                          (rec.action == "buy" and v == "bearish") or
                          (rec.action == "sell" and v == "bullish"))]
        if dissenters:
            disagree = f" Dissent from: {', '.join(dissenters)} (lower conviction)."
    return (
        f"{side} {rec.pair} @ ~{rec.price:.5f}, confidence {rec.confidence}/10. "
        f"Trees: {_tree_summary(rec)} (net {rec.net_score:+.2f}). "
        f"Stop {rec.stop_loss:.5f}, target {rec.take_profit:.5f}, "
        f"risk {rec.risk_pct:.2f}% of account.{disagree}"
    )


def narrate(rec, held: bool = False, use_llm: bool = False) -> str:
    """Return a rationale string for a Recommendation. `use_llm` is reserved
    for a future LLM narrator; it currently returns the deterministic text so
    behavior stays reproducible."""
    # An LLM narrator would go here (feature-flagged, cached); it must never
    # change the decision, only describe it. Falls through to the template.
    return _held_rationale(rec) if held else _trade_rationale(rec)
