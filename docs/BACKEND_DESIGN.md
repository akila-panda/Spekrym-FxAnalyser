# Spekrym-FX — Backend Development: Design

**Companion to** `BACKEND_PHASES.md`. Date: 2026-10-22. **Scope: Python backend** (`engine/`, `backtest/`, `market_context/`, `agents/`, `api/`, `data/`, `ta_engine/`, `forecast/`, `risk/`, new `core/`, `research/`, `intelligence/`, `scenarios/`, `trading/`, `visual/`). Starts **after** the frontend is built; implements the **same `docs/CONTRACTS.md`** the frontend already renders against mocks.

**Reading map:** `MASTER_DEVELOPMENT_PLAN.md` → `contexts/*.md` (contexts #1–#7 server sides) → `CONTRACTS.md` → this file → `BACKEND_PHASES.md`.

---

## 0. Vision & boundary
The backend **produces** the versioned, causal, reproducible records the frontend consumes, and **holds all authority** the frontend lacks: the Judge's verdicts, the VAULT, risk vetoes, and server-side authorization. Guiding rule: **reuse, don't fork** — the research spine (`engine/`) is production-grade and stays the incorruptible core; new work wraps it. The platform is a **strategy-agnostic research factory** whose honest default outcome is rejection; its integrity rests on the Judge + FDR + the holdout.

## 1. The planes & the 8 bounded contexts
Engines publish versioned facts/interpretations/hypotheses; nothing draws on a chart (that is the frontend Visual Intelligence layer); validation + risk keep authority. Server sides of: **Data Foundation · Market Intelligence · Scenario Intelligence · Research OS · Strategy/Trade/Portfolio · Safety/Execution · Visual Intelligence (gateway/graph/provenance)**. Each has one owner (`contexts/*.md`); a shared service may power many workflows, ownership stays singular.

## 2. Governance (the hard guarantees)
- **The Judge is the sole verdict authority** (`engine/judge.py`); LLMs/heuristics propose, never self-certify.
- **VAULT is server-side** (`engine/partition.py` `load_vault(final_confirmation=True)`, counted + logged); no API/LLM/workflow path reaches it otherwise.
- **Authorization is server-side** (`AuthorizationDecision`): VAULT access, live promotion, raising risk limits, enabling autonomy — human-controlled, audited (D11).
- **Risk veto beats everything** (Safety/Execution); strategy/portfolio authorization is separate from research approval.
- **Append-only + tamper-evident** ledger (`engine/ledger.py`); FDR keyed to `experiment_count`; `vault_confirmed` ≠ guarantee.
- **LLM/compiler-generated code is sandboxed** — isolated workers, allowlists, resource limits; can never modify the Judge, unlock the VAULT, or touch credentials.

## 3. Foundations every record needs
- **Canonical market clock / point-in-time** (`core/market-clock`): `eventTime/publishedAt/receivedAt/availableAt`; no-lookahead at the data layer, not just the strategy.
- **One cost model** (D1 — recommend `scalp_engine` real bid/ask), versioned as `cost_model_version` on every run/trade; others become diagnostics.
- **Identity + canonical records** (`core/identity`): the 8 records (`CONTRACTS.md`), the 5-type distinction, content/semantic hashing.
- **Reproducibility** (`research/artifacts`): immutable `RunManifest` (wires the unused `freeze_spec`), content-addressed artifacts; replay/live parity tested.

## 4. Contracts produced (source of truth: `docs/CONTRACTS.md`)
Data Foundation → `MarketEvent`, `DatasetManifest`, `FeatureRecord`, `QualityScore`. Market Intelligence → `AnalysisObject`, `RegimeSnapshot`, `IntelligenceInsight`, `ContextInsight`. Scenario → `ScenarioSpecification`, `ScenarioState`, `ForecastDistribution`. Research OS → ledger `register`/`result`/`Verdict` (extended), `RunManifest`, `ValidationReport`, `evidence_tier`, `StrategyVersion`/`HypothesisDraft`/`ExecutableSpec`. Strategy/Trade/Portfolio → `TradeRecord` (4 categories), `OpportunityRecord`, `EligibilityDecision`, `DecisionTrace`, `PortfolioExposure`. Safety → `CostModel`/`FillModel`, `SafetyLimits`/`SafetyVeto`/`OrderState`, `AuthorizationDecision`. Visual Intelligence (server) → provenance + evidence graph behind `IntelligenceInsight`/`ViewManifest`. Each produced via a pydantic model, parity-tested against the frontend zod, with a fixture captured from real output.

## 5. API surface
Extend the existing FastAPI app (`api/main.py` `create_app`). Keep error body `{"detail": "..."}`, snake_case, UTC-ISO wire, CORS `localhost:5173`. Existing `GET /api/strategies|bounds|candles` + `POST /api/scan` stay (frontend `httpSource` hardcodes them) and are aliased under `/api/v1`. **New endpoints are `/api/v1/*`, additive**: `/trades`, `/reports/*`, `/regime`, `/experiments` (GET + POST register), `/jobs` (POST + GET poll), `/validate`, `/coordinator` (shadow). **Async job lifecycle** for long runs (`POST /jobs → 202 {id}` → poll); the frontend seam hides polling. **Vault jobs require `final_confirmation` and are refused otherwise.** Every endpoint ships with a frozen fixture.

## 6. Event-driven backbone
Durable queue / transactional outbox for **facts** (`dataset.ready`, `experiment.registered`, `backtest.completed`, `validation.completed`, `strategy.approved/suspended`, `regime.model_updated`). Distinguish a **command** (`RunExperiment`) from a **fact** (`ExperimentCompleted`) to prevent duplicate execution and keep workflows auditable. No in-memory bus for results that must survive restart.

## 7. Reuse map (verified; reuse unchanged core)
`engine/{judge,partition,ledger,runner,datacache}.py` + `engine/ledger.jsonl` (the incorruptible core — reuse, wrap) · `backtest/scalp_engine.py` (canonical bid/ask fills) · `research/walkforward_eurusd.py` (expanding WF pattern) · `market_context/{context,structure,levels,imbalance,premium_discount,liquidity,displacement}.py` + `ta_engine/{smc,facts,indicators,price_action,support_resistance,loader}.py` (detectors/features — unify behind the shared analysis core via parity tests) · `agents/{coordinator,audit,service,technical_tree,fundamental_tree,sentiment_tree,base}.py` (deterministic brain → expose + add validated-only gate) · `forecast/{model,features,predict,eval,train}.py` (Category-C candidate behind calibration) · `data/{oanda_client,fetch_ohlcv,fetch_calendar,loader,manifest,qa,validation,scheduler,instruments,db}.py` (ingest/QA/manifest — extend with point-in-time + versioning) · `risk/{position_sizing,stops,currency,correlation}.py` (primitives → feed the stateful safety module). **No second Judge, no second TA stack, no second cost model.**

## 8. Tests that must stay green (regression safety net)
`engine/tests/{test_judge,test_partition,test_ledger,test_runner,test_adversarial,test_golden,test_end_to_end,test_datacache}.py` (datacache needs the DB) · `backtest/tests/{test_engine,test_scalp_engine,test_risk,test_currency}.py` · `agents/tests/{test_agents,test_coordinator}.py` · `api/tests/test_api.py` · `market_context/tests/*` · `ta_engine/tests/*` · `forecast/tests/{test_features,test_model}.py` · `data/tests/*`. Every extension is additive; golden + adversarial numbers must still reproduce exactly (the cost-model unification especially).
```
Rule: the backend owns truth and authority; it extends the incorruptible core, never replaces it, and never leaks a future value into a historical view.
```
