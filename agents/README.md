# agents — Multi-Agent Reasoning Layer (Phase 4)

Synthesizes the technical, fundamental, and sentiment views into one
explainable, risk-managed recommendation per pair.

## Design choice: deterministic agents, not an LLM swarm

`03-agents.md` describes an LLM swarm. This implementation makes every agent a
**deterministic function of a `MarketContext`** instead. That is a deliberate
trade to satisfy the project's own principles:

- **Backtestable by default** — the whole reasoning layer replays bar-by-bar
  through the Phase 2 engine (`backtest/run_coordinator.py`), so we can *prove*
  it profitable rather than assert it.
- **Confidence is earned** — because it can be measured against realized
  outcomes.
- **No API cost / fully reproducible tests.**

An LLM is still welcome where it's actually good: **narrating** the rationale
(`narrator.py`, `use_llm` hook). It never makes the decision.

## Structure

| File | Role |
|---|---|
| `base.py` | `Bias`, `AgentVerdict`, `TreeVerdict`, `MarketContext`, `aggregate()`, context builder |
| `technical_tree.py` | ForecastAgent (ML edge), PriceActionAgent (SMC/patterns/S-R), VolatilityAgent (regime modulator), CrossRateAgent |
| `fundamental_tree.py` | EconomicCalendarAgent (blackout + surprise), CentralBankAgent, NewsImpactAgent |
| `sentiment_tree.py` | RiskSentimentAgent (risk-on/off proxy from FX majors), Positioning/News stubs |
| `coordinator.py` | `StrategyCoordinator` — weighs trees, surfaces disagreement, applies risk-first gates, confidence-scaled sizing |
| `narrator.py` | deterministic rationale (optional LLM hook) |
| `audit.py` | append-only JSONL decision log (`agent_workspace/logs/decisions.jsonl`) |
| `service.py` | live entrypoint: full cross-pair + calendar context across all pairs |

## Key behaviors

- **Weighs, doesn't average.** Tree weights default `technical 0.60 / fundamental
  0.25 / sentiment 0.15`, configurable via `StrategyCoordinator(tree_weights=...)`.
- **Surfaces disagreement.** `recommendation.disagreement` + the narrator name
  which trees dissented; dissent lowers confidence but is never silently netted.
- **Risk-first gates (hard vetoes):** `news_blackout`, `dead_volatility`,
  `no_directional_consensus`, `below_min_conviction`, `below_min_confidence`.
- **Confidence-scaled sizing.** Position risk scales from `risk_min`→`risk_max`
  with the 1–10 confidence; the engine honors the per-signal `risk_pct`.
- **Abstention.** Agents lacking their input (cross-pair data, calendar, news
  feed) abstain rather than voting neutral, so a single-pair backtest exercises
  the technical tree + gates, and the live service adds the rest.

## Run

```bash
# live recommendations for all pairs (needs the DB up; writes the audit log)
python -m agents.service

# prove it in backtest on the EUR_USD out-of-sample holdout
python -m backtest.run_coordinator
```

Output schema matches `03-agents.md` (`action`, `confidence`, `entry_points`,
`stop_loss`, `take_profit`, `agent_agreement`, `rationale`) plus `net_score`,
`disagreement`, `gates`, and full per-tree/per-agent verdicts for audit.

## Not yet wired (honest limits)

- No news/sentiment API → NewsImpact, NewsSentiment, Positioning agents abstain.
- Calendar surprise assumes higher-than-forecast = stronger currency (true for
  the majority of releases, not all).
- Confidence is currently derived from conviction × agreement; tying it to the
  *backtested* accuracy of similar agreement patterns (03-agents.md item 4) is
  the natural next step now that the audit log exists.
