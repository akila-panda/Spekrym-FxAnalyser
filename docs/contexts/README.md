# Spekrym-FX — Bounded-Context Deep-Dives

Per-context detail behind `docs/MASTER_DEVELOPMENT_PLAN.md` (Part II §5). Each file follows the same 11-section template: mission & boundary · current state (audited) · internal components · owned records & contracts · interfaces · guardrails · phases · acceptance tests · open decisions · namespaces & tests-to-keep-green · cross-context links. All grounded in the 2026-10-22 repo audit with `[VERIFIED path:line]` / `[DOC]` / `[PROPOSED]` tags.

| # | Context | File | One-line role | Maturity |
|---|---|---|---|---|
| 1 | Data Foundation | [DATA_FOUNDATION.md](./DATA_FOUNDATION.md) | trustworthy, point-in-time, versioned data + features | EXISTS (ingest/QA/manifest); NEW point-in-time + versioning |
| 2 | Market Intelligence | [MARKET_INTELLIGENCE.md](./MARKET_INTELLIGENCE.md) | causal *descriptions* of the market (objects, regime) | EXISTS two detector stacks; NEW RegimeSnapshot + shared core |
| 3 | Scenario Intelligence | [SCENARIO_INTELLIGENCE.md](./SCENARIO_INTELLIGENCE.md) | explicitly conditional "future reads" (A/B/C) | mostly NEW |
| 4 | Research Operating System | [RESEARCH_OS.md](./RESEARCH_OS.md) | pre-register → run → Judge → VAULT → immutable record | EXISTS strong core; EXTEND scaffolding |
| 5 | Strategy / Trade / Portfolio | [STRATEGY_TRADE_PORTFOLIO.md](./STRATEGY_TRADE_PORTFOLIO.md) | validated strategies, 4-category trade ledger, selector, portfolio | EXISTS coordinator; NEW ledger/registry/portfolio |
| 6 | Safety / Execution | [SAFETY_EXECUTION.md](./SAFETY_EXECUTION.md) | canonical cost/fill, kill switch, shadow→live gate | EXISTS cost primitives; NEW safety layer (biggest gap) |
| 7 | Visual Intelligence | [VISUAL_INTELLIGENCE.md](./VISUAL_INTELLIGENCE.md) | engines never draw directly — one honest chart | EXISTS rendering foundations; NEW gateway/orchestrator/canvas |
| 8 | Experience Plane | [EXPERIENCE_PLANE.md](./EXPERIENCE_PLANE.md) | the trader surfaces over shared records | EXISTS Scan/Desk DK0–19; NEW Canvas + reserved surfaces |

**Reading order:** the Master Development Plan first (architecture + waves), then any context. Data Foundation (#1) and Research OS (#4) are the most mature; Safety/Execution (#6) is the biggest risk gap; Visual Intelligence (#7) + Experience Plane (#8) carry the chart-native vision.

**Cross-cutting invariants that bind all eight:** one canonical market clock / point-in-time model · the Judge is the sole verdict authority · strategy/portfolio authorization is separate from research approval (risk may veto) · the five evidence types (Object/Insight/Scenario/Signal/Order) are never interchangeable · every chartable statement resolves to real geometry · the same records drive live/replay/export · complexity lives inside the system, not the trader's experience.
