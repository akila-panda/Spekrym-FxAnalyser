# Spekrym-FX — Backend Development: Build Phases

**Companion to** `BACKEND_DESIGN.md`. Date: 2026-10-22. **Scope: Python backend.** One phase per session; finish → verify → report files → STOP (WAIT). Begins after the frontend (`FRONTEND_PHASES.md`) is built; implements the **same `docs/CONTRACTS.md`**.

**Definition of done (every phase):** `pytest -q` green (incl. the golden + adversarial suites) · new logic has tests · produces records conforming to `docs/CONTRACTS.md` (pydantic ↔ frontend zod parity, fixture captured from real output) · **additive + backward-compatible** (existing `SCAN_CONTRACT` endpoints unchanged; new under `/api/v1`) · **no future leaks** (point-in-time respected) · every run/trade carries `cost_model_version` + `data_version` where applicable · reuse the incorruptible core, never fork · report files created/modified only. Prose < 400 words excluding code.

**Do NOT:** add a second Judge / TA stack / cost model · mutate the append-only ledger except via `register`/`record_result` · expose any path to `load_vault` without `final_confirmation` · let generated/LLM code reach the Judge, VAULT, or credentials.

---

## Reuse map (reuse unchanged core)
`engine/{judge,partition,ledger,runner,datacache}.py` · `backtest/scalp_engine.py` · `research/walkforward_eurusd.py` · `market_context/*` + `ta_engine/*` (unify via parity tests) · `agents/{coordinator,audit,service,*_tree,base}.py` · `forecast/*` · `data/{oanda_client,fetch_ohlcv,fetch_calendar,loader,manifest,qa,validation,scheduler,instruments,db}.py` · `risk/*`. **Gaps to build:** `core/{market-clock,data-quality,features,identity,events}`, `research/{hypotheses,compiler,workflows,artifacts,judge-adapter,models}`, `intelligence/{regime,…}` unification, `scenarios/*`, `trading/{strategy-registry,trade-intel,opportunities,portfolio,execution,risk}`, `visual/{gateway,evidence-graph}` server sides, the `/api/v1` surface + async jobs.

---

## Milestones & phases (B-track). `☐` not started.

### BM0 — Foundations (unblocks everything; resolve `DECISIONS.md` first)
- **B0 — Canonical market clock + point-in-time (W0.2).** `core/market-clock`, `core/data-quality`: add `eventTime/publishedAt/receivedAt/availableAt` + `dataVersion` to ingestion + the `candles` store; as-of filtering in the loader; evolve `data/qa.py` → graded `QualityScore` + quarantine; `data/manifest.py` → versioned `DatasetManifest`. Tests: no-future-leak as-of query; `data/tests` green; reproduce-from-version.
- **B0b — Cost-model unification (W0.3).** Pick the canonical basis (D1: `scalp_engine` bid/ask); add `cost_model_version` to all engine outputs; make commission/slippage explicit; serve bid/ask via the API. Tests: **`engine/tests/test_golden.py` + `backtest/tests/*` reproduce known numbers**; version recorded.
- **B0c — Identity + record contracts (W0.4).** `core/identity`, `core/events`: pydantic models for the 8 records + the 5-type distinction; parity with frontend zod. Tests: schema round-trip; FE/BE parity on fixtures.

### BM1 — Research OS hardening (reuse + extend `engine/`)
- **B1 — Strategy Specification + registry/version library (W1.1).** Typed spec + Python-plugin interface; version = spec hash; structural diff + duplicate detection. Tests: compile + register; variant → new version; `engine/tests` green.
- **B2 — Strategy Compiler + Static Analysis (W1.2).** Reject invalid/contradictory/future-data/unbounded-lookback; sandbox generated Python (allowlist, resource limits, isolated worker). Tests: invalid specs rejected pre-backtest; sandbox-escape.
- **B3 — Run Manifest + Artifact Store (W1.3).** Wire `freeze_spec`; immutable, content-addressed bundle per run. Tests: same-manifest reproduces within tolerance; frozen-spec binds code/data/cost.
- **B4 — Evidence tiers + verdict extension + promotion history (W1.4).** Derive `exploratory/in_sample/validated/vault_confirmed`; persist fdr_alpha/split/data_version/code_commit; promotion view. Tests: tier transitions; `test_ledger.py` green.
- **B5 — Workflow DAG + async job API (W1.5).** Experiments as DAGs (deps, retries, checkpoint, quotas, approval, idempotent, immutable); `POST /api/v1/jobs`→202, poll; move batch/vault runs to jobs. Tests: job lifecycle; restart recovery; vault job refused without `final_confirmation`.
- **B6 — Research Knowledge Graph (W1.6).** Relational strategy↔hypothesis↔failure↔experiment↔dataset↔model. Tests: relationship integrity ("which families failed?"). **Gate GB1** (Judge-integrity + reproducibility hold through the new scaffolding).

### BM2 — Trade Intelligence
- **B7 — `TradeRecord` 4-category ledger (W2.1).** Enrich `ScalpTrade` with regime_snapshot_id + decision_trace + slippage + commission + lineage; executed/rejected/eligible/counterfactual. Tests: schema completeness; survival-bias (rejected logged).
- **B8 — Reports (W2.2).** Loss taxonomy, regime-conditioned performance w/ `insufficient_sample` (n<30), potential-trade, comparison. Tests: report correctness; small-cell flag.
- **B9 — Trade endpoints (W2.3).** `GET /api/v1/trades`, `/trades/{id}`, `/reports/*` + fixtures. Tests: `api/tests` contract; frozen fixture.

### BM3 — Market & Regime Intelligence
- **B10 — Causal `RegimeSnapshot` v0.1 (W3.1).** Rule-based, wraps `market_context/context.py`; full vector + `available_at`; separate regime vs HTF bias vs execution. Tests: no-future-leak (mirror `test_adversarial.py`).
- **B11 — Regime diagnostics (W3.2).** Stability, switch-rate, early-detection lag, cross-instrument consistency, calibration, after-cost value, detect-vs-describe. Tests: diagnostic metrics; calibration.
- **B12 — Analytical families (W3.3).** Trend/momentum, volatility, statistical, relative strength; CONDITIONAL volume/auction/options. Tests: per-family detectors.
- **B13 — Evidence Relationship & Contradiction Engine (W3.4).** Independent/correlated/contradictory/unavailable/contextual; dependency groups; dedup. Tests: correlated counted once; contradiction not averaged.
- **B14 — Shared analysis core + feature store parity (W9.3).** One spec across backend/frontend; migrate duplicated ATR/vol/swing/momentum (`ta_engine`/`forecast`/`desk/kernel`) behind `core/features`. Tests: cross-runtime + cross-module parity. **Gate GB2** (regime causal + parity proven).

### BM4 — Scenario Intelligence
- **B15 — `ScenarioSpecification` + lifecycle (W4.1).** Branches/conditions/invalidation/horizon/expiry; frozen before outcome; versioned. Tests: lifecycle; frozen-before-outcome.
- **B16 — Trigger engine + projection geometry (W4.2).** Fire/expire/invalidate; categories A/B/C. Tests: honesty (no % without a validated model); trigger correctness.
- **B17 — Analogues + Forecast Calibration Monitor (W4.3).** Causal analogue retrieval → outcome ranges; OOS calibration tracking (gates Category C). Tests: no-cherry-pick; calibration tracking.

### BM5 — Master Research Brain (LLM proposes only)
- **B18 — Brain contracts (W6.1).** Research Planner / Evidence Analyst / Hypothesis Generator / Strategy Developer / Experiment Designer / Orchestrator / Research Memory as separated responsibilities + console API. Tests: contract.
- **B19 — Propose → compile → register (W6.2).** Hypothesis → sandbox strategy draft → test plan → `ledger.register` (human-approved); no auto-promote. Tests: "cannot write a verdict / cannot reach load_vault".
- **B20 — Persistent Research Memory (W6.3).** Over the knowledge graph (incl. negatives). Tests: memory recall ("already investigated?").

### BM6 — Strategy / Trade / Portfolio
- **B21 — Expose coordinator + validated-only Selector (W7.1).** `GET /api/v1/coordinator` (shadow); exclude un-validated strategies. Tests: `test_coordinator.py` green + eligibility-gate.
- **B22 — Portfolio Intelligence + Simulator (W7.2).** One shared clock/account/margin; cross-strategy dependence, currency exposure, DD/tail, allocation under limits. Tests: combined-decisions equity (not summed).
- **B23 — Strategy Lifecycle & Decay (W7.3).** Candidate→Validated→Shadow→Active→Suspended→Retired; statistically-justified thresholds; suspend without code change. Tests: decay threshold; suspension audit.

### BM7 — Safety & Execution (gates any live)
- **B24 — Stateful Risk/Safety module (W8.1).** Kill switch, daily-loss, max-DD, exposure cap; backend-enforced veto. Tests: limit enforcement; veto precedence. **Gate GB3** (kill switch exists + tested — prerequisite for anything live).
- **B25 — Shadow mode (W8.2).** Live inputs, logged proposed selections + hypothetical fills, simulated-vs-observed; no orders. Tests: "no order path reachable"; fill labelling.
- **B26 — Broker adapter + micro-live (W8.3) — DEFER.** Only after separate human authorization + kill switch. Tests: reconciliation; kill-switch drill.
- **B27 — Execution Simulation Laboratory (W9.1).** Fidelity L1 candle / L2 bid-ask / L3 tick / L4 stress; label fill assumptions when no depth. Tests: fidelity parity.

### BM8 — Scale, models & data intelligence
- **B28 — Scenario & Robustness Laboratory (W9.2).** Perturbation sweeps → robustness profile per version. Tests: robustness profile.
- **B29 — Model Registry (W9.4).** Regime/forecast/anomaly models; versions, calibration, drift, deployment (unlocks Scenario Category-C). Tests: version/drift.
- **B30 — Distributed Research Compute + dedup (W9.5).** Quotas, content-addressed caching, early termination, budgets, experiment dedup. Tests: dedup before run; budget enforcement.
- **B31 — Data Intelligence & Quality extend + event backbone.** Multi-provider (CONDITIONAL), cross-provider comparison, durable event outbox (`dataset.ready` … `validation.completed`). Tests: graceful-unavailable; event idempotency.

---

## Dependencies & gates
Critical path: **B0 → B0b → B0c → B1 → B3 → B4 → B5 (GB1)**. BM2 (B7–B9) depends on B0c + B3. BM3 (B10–B14) depends on B0 + B0c; B14 enables shared-core. BM4 depends on B10 + the model registry (B29) for Category C. BM5 depends on B5 + B6. BM6 depends on B4 (eligibility tier). **BM7 is a prerequisite for any live ambition — B24 (GB3) before B25/B26.** BM8 slots any time after B5. Frontend surfaces flip to `api` (`FRONTEND_PHASES.md` F22) as each matching endpoint + fixture lands.

## Owner decisions (see `docs/DECISIONS.md`)
**D1 cost model (settle first — gates all comparability), D2 reference line, D4 data subscriptions (CONDITIONAL features), D5 instruments, D6 authority (shadow-only → B26 deferred), D9/D11 research controls + authorization ownership (human-only VAULT/live), D10 regime forecasts (deterministic first).** Resolve in `DECISIONS.md` before B0.

## Session protocol
Start a session by reading only: this phase block + the relevant `BACKEND_DESIGN.md` section + the `CONTRACTS.md` record(s) + the owning `contexts/*.md`. Small files over big ones. Capture a real-output fixture per new endpoint/record. Run `pytest -q` once at the end (`| tail`). One phase, then STOP (WAIT).
```
The backend extends the incorruptible core to produce the exact contracts the frontend already renders — strategy-agnostic, causal, reproducible, honestly rejecting most of what it tests.
```
