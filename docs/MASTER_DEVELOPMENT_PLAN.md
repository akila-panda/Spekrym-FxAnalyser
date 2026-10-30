# Spekrym-FX — Master Development Plan

**Status:** PROPOSED FORWARD PLAN (not yet in build). **Date:** 2026-10-22.
**Purpose:** the single, detailed plan of *what we build, in what order, under which contracts and rules* to evolve Spekrym-FX from its current state (a forex research backend + a Scan/Desk/Relay cockpit) into the future-state **quantitative research & market-intelligence operating system** described across the five vision passes (A–E) and the Unified Blueprint.

**How this plan relates to the other docs**
- `docs/INTEGRATION_DESIGN.md` — the backend↔frontend integration design + the real code audit. This plan **supersedes its sequencing** by reorganizing it under the 8 bounded contexts, but keeps its audited facts.
- `Spekrym_FX_Unified_System_Blueprint.docx` (~/Downloads) — the canonical architecture synthesis. This plan is its implementable form.
- Vision sources A–E (held in session memory): A = research OS; B = DESK intelligence; C = chart-native click-to-map; D = Intelligence Canvas; E = feature catalog + 8 domains.
- `DEVELOPMENT_ROADMAP.md` (repo root) — the original Judge/V0–V5 research roadmap. Still valid for the research spine; folded into Wave 1 here.
- `frontend/DESK_PHASES.md` (DK0–DK21) — the already-built DESK scope. **Retained as historical build scope**; the forward DESK work is the new "Desk Visual Intelligence 2.0" programme (Wave 5).

**How to read status tags** used throughout: **EXISTS** (built, reuse) · **EXTEND** (additive to existing) · **NEW** · **CONDITIONAL** (needs data rights / feed quality / empirical evidence) · **DEFER**. Code citations like `engine/judge.py:22` are from the 2026-10-22 audit; verify before relying.

**Three honest anchors that shape every decision below**
1. The repo's own research found **no durable, cost-surviving edge** in single-pair EUR/USD intraday price; the failure is a *signal* failure. So this platform is built to **honestly search and reject**, not to dress up a known-dead strategy. `[DOC NO_INTRADAY_EDGE.md]`
2. The platform is **strategy-agnostic** — a factory that authors/tests/validates many strategies, not an OBE project. Every contract is keyed by `strategy_id`/`strategy_version`.
3. **Complexity lives inside the system, not in the trader's experience.** Powerful engines underneath; clean, honest, chart-native evidence on top.

---

## PART I — PRINCIPLES & GOVERNANCE

### 1. Non-negotiable design rules (apply to every phase)
1. **One canonical market clock / point-in-time availability model.** Every datum carries `eventTime / publishedAt / receivedAt / availableAt`; event time alone is never sufficient. No future leaks, ever.
2. **Research verdicts belong exclusively to the independent Judge** (`engine/judge.py`). LLMs and heuristics may *propose*; they can never self-certify.
3. **Strategy/portfolio authorization is separate from research approval.** Risk/safety controls may veto anything. Live eligibility ≠ research PASS.
4. **Five evidence types are visually and semantically distinct and never interchangeable:** *observed fact · heuristic interpretation · conditional scenario · calibrated forecast · validated signal.* They are separate types **and** separate screens.
5. **Every chartable statement must resolve to real price/time geometry or verified object links.** Never invent a target/line/zone for presentation.
6. **The same records drive live, replay, export, and analytics.** Version changes never rewrite historical knowledge; replay shows only what was knowable at the as-of.
7. **Complex engines stay invisible until their output helps a user task.** No feature-count-driven navigation; the Overlay Manager + Attention + Decision-Compression are *foundational*, not extras.
8. **Reuse, don't fork.** No second Judge, no second technical-analysis stack, no second cost model. Preserve existing behaviour + test contracts; controlled changes for unification (cost model, lineage) are allowed and must keep golden/adversarial tests green.

### 2. Governance & operating modes
- **Research mode** — isolated, versioned; propose/backtest/compare; no live deploy.
- **Shadow mode** — read live data, compute regimes/insights, log proposed selections + hypothetical fills; **no orders**; distinguish simulated vs observed fills.
- **Live mode** — select only validated strategies, apply risk limits; no unvalidated code, no auto-promotion; kill switch mandatory.
- **Who decides what:** Brain/LLM *proposes* → deterministic code *computes* → the Judge *decides* PASS/FAIL/INCONCLUSIVE → a *human* authorizes the single VAULT confirmation and any live promotion. The **backend** enforces holdout + risk gates server-side; the UI and the Brain can never reach `load_vault` or bypass risk. `[VERIFIED engine/partition.py:55-70]`

### 3. Statistical integrity (the factory's core discipline)
Testing many strategies manufactures false positives; the guardrails are mandatory, not optional:
- Pre-registration binds the gate by hash; post-hoc gate edits rejected. `[VERIFIED engine/ledger.py:72-77]`
- Benjamini-Hochberg FDR keyed to the ledger's experiment count. `[VERIFIED engine/judge.py:70-84]`
- `min_trades ≥ 30` is a floor, not proof of power; add minimum economically-meaningful effect size, bootstrap CIs + sensitivity, OOS-degradation, and research-family/dependent-hypothesis + validation-reuse controls.
- `vault_confirmed` is *stronger evidence, not a guarantee*. Expectancy net of real cost, never win rate, is the target.

---

## PART II — TARGET ARCHITECTURE

### 4. The layered stack (planes)
```
Market Data & Intelligence Engines   (Technical · Regime · Liquidity · Macro · Quantitative · Cross-Asset)
            │  versioned facts / interpretations / hypotheses (point-in-time)
            ▼
Spekrym-FX Intelligence Core         (Evidence · Causality · Scenarios · Research · Risk · Orchestration)
            │  IntelligenceInsight + geometry refs — engines NEVER draw directly
            ▼
Intelligence Canvas + Desk           (Prepare → Explore → Monitor → Decide → Review)   + Scan + Relay
            │  decisions, opportunities, plans, reviews
            ▼
Research & Learning Loop             (Backtest · Independent Judge · Validation · Trade Intelligence · Strategy Lifecycle)
```
Engines **publish**; the **Visual Intelligence Orchestrator** converts references into clean presentation; **validation + risk retain authority**.

### 5. The 8 bounded contexts (single ownership; a shared service may power many workflows)

| # | Context | Owns | Exposes / constraint | Status |
|---|---|---|---|---|
| 1 | **Data Foundation** | connectors; tick/bid-ask/OHLC/event ingestion; calendars; FX ref data; data-quality; point-in-time store; datasets | `MarketEvent`, `DatasetManifest`, `FeatureRecord`; never trading recs | EXISTS(data/)+EXTEND |
| 2 | **Market Intelligence** | technical detection, sessions/liquidity, regime, volatility, cross-asset, macro, options, auction, anomaly | versioned `AnalysisObject`, `RegimeSnapshot`, `IntelligenceInsight` w/ causal provenance | EXISTS(market_context,ta_engine,desk/detect)+EXTEND |
| 3 | **Scenario Intelligence** | conditional scenario authoring, projection geometry, analogues, scenario evaluation, forecast calibration | `ScenarioSpecification`, `ScenarioState`, `ForecastDistribution`; no fabricated probabilities | NEW |
| 4 | **Research Operating System** | hypothesis registry, knowledge links, compiler, DAG jobs, artifact store, robustness, Judge, VAULT, model registry | `ExperimentResult`, `ValidationReport`, `RegistryDecision`; immutable ledger + permissioned gates | EXISTS(engine/)+EXTEND |
| 5 | **Strategy / Trade / Portfolio** | strategy registry, signal observation, opportunity+trade journal, selector, portfolio replay, live allocation | `EligibilityDecision`, `Trade/OpportunityRecord`, `PortfolioExposure`, audited constraints | PARTIAL(agents/coordinator,risk/)+NEW |
| 6 | **Safety / Execution** | canonical cost/fill, broker connectivity, order state, guardrails, kill switch, monitoring | live execution eligibility, safety vetoes, operational state; separate from Master Brain | NEW (risk/ primitives exist) |
| 7 | **Visual Intelligence** | gateway, evidence/dependency graph, visual prioritization, overlay mapping, contradiction + attention | `ViewManifest` referencing true objects; presentation only; cannot alter conclusions | NEW |
| 8 | **Experience Plane** | Desk, Canvas, Scan, Relay, Research Workbench, reviews, chart-linked query, alerts, journal | guided workspaces over shared records; local-only view prefs | EXISTS(frontend/)+EXTEND |

### 6. Cross-connections (producer → consumer → contract)
| Producer | Consumer(s) | Contract |
|---|---|---|
| Data ingest/quality | technical, regime, macro, features, simulation | `MarketEvent` + quality + `available_at`; point-in-time |
| Technical analysis | evidence graph, Desk, Scenario, Research | `AnalysisObject` (geometry, lifecycle, provenance) |
| Regime/transition | Desk, Selector, Research, Scenario | `RegimeSnapshot` + model/version + stability |
| Cross-asset/macro/options | Desk, Research, Scenario, Risk | `ContextInsight` + availability + source rights |
| Trade/Opportunity Intel | Brain, Journal, Review, lifecycle | `DecisionTrace`, `OpportunityRecord`, `TradeRecord` |
| Master Brain | Workflow, compiler, researcher UI | `HypothesisDraft` + pre-registered experiment proposal |
| Compiler + Workflow | Runner/Scenario Lab/Judge | `ExecutableSpec` + `RunManifest` + immutable artifacts |
| Judge | Strategy Registry, Research UI | `ValidationReport`; verdict immutable, separate from proposals |
| Strategy Registry/Selector | Desk readiness, Portfolio, Risk | validated eligibility + rationale + version |
| Portfolio/Safety | Desk risk strip, execution adapter | exposure, constraints, veto, alerts |
| Any intelligence engine | Visual gateway → relations → attention → Canvas | `IntelligenceInsight` + geometry refs — never direct drawing |
| Canvas interactions | all inspection services | `ViewQuery`/selection/as-of; no analytical-truth mutation |

### 7. Current baseline (audited 2026-10-22 — what already exists)
- **Research spine (EXISTS, reuse):** Judge gates (`engine/judge.py:22-39` cost_pips=1.6, min_trades=30, min_fold_pos=0.75, fdr_alpha=0.05); VAULT (`engine/partition.py:20,55-70`, 0 consultations); append-only ledger (`engine/ledger.py`); bid/ask backtest (`backtest/scalp_engine.py`); `freeze_spec` lineage slot exists but **unused** (`engine/ledger.py:26-35`).
- **Coordinator "brain" (EXISTS, deterministic):** `agents/coordinator.py:85` risk-first veto + confidence; JSONL decision log; **not exposed over HTTP**.
- **Market context (EXISTS, rule-based):** `market_context/context.py:26` causal MTF snapshot; structure/liquidity/FVG/PD detectors; **no HMM/change-point/clustering**.
- **Risk (PARTIAL):** sizing/stops/correlation; **no kill switch / daily-loss / max-DD / exposure cap**.
- **API (EXISTS, thin):** FastAPI `GET /api/strategies|bounds|candles`, `POST /api/scan` (synchronous); registry serves **only ORB**.
- **Frontend (EXISTS):** Scan `DataSource` (live HTTP ready) + Desk `DeskSource` (mock-only, reserved `getEngineObjects` seam); 124 tests; zod contracts + frozen fixtures; DESK **DK0–DK19 built**; `analytics`/`journal` window roles reserved placeholders.
- **Cost models disagree (must unify):** `backtest/engine.py` 0.6/0.1 (or 0.0 for OBE run), `scalp_engine.py` real bid/ask, scanner `api/strategies/orb.py` flat 1.6.

---

## PART III — FOUNDATIONAL CONTRACTS (build before expanding)

These three are the "establish first" contracts; every engine speaks them. (Vision A's biggest single recommendation.)

### 8. Contract 1 — Strategy Specification (`trading/strategy-registry`)
A typed, versioned representation that compiles to a validated executable, **and** a typed Python-plugin interface with the same metadata + execution contract. Support BOTH behind one interface.
- Illustrative shape: `strategy{ id, version, universe{instruments,timeframe}, entry{direction,conditions[]}, exit{stop,target}, risk{risk_per_trade}, execution{model} }`.
- Enables: structural diff between versions, duplicate/near-duplicate detection, search by entry logic/instrument/regime, forbidding LLM edits to protected parts, reproducing a historical strategy without reconstructing source, and frontend form/visual-editor generation.
- Maps to the ledger: a strategy *version* = the ledger registration id (spec hash). `[VERIFIED engine/ledger.py:21]`

### 9. Contract 2 — Experiment / Run Manifest (`research/artifacts`)
Immutable artifact bundle per run: strategy spec + compiled code, dataset id + content hashes, regime/feature versions, cost-model + params, runtime env + deps, seeds, trades/decisions/diagnostics/validation, hypothesis + approval history. Reproduce any result months later. (Wires the unused `freeze_spec`.)

### 10. Contract 3 — Point-in-Time Market Data (`core/market-clock`, `core/data-quality`)
Distinguish `eventTime / publishedAt / receivedAt / availableAt`; point-in-time joins; dataset versioning + immutable snapshots + provenance; data-quality scoring + quarantine. No-lookahead enforced at the data layer, not only in strategies.

### 11. The canonical records (identity, time, evidence) and the 5-type distinction
| Record | Min fields | Invariant |
|---|---|---|
| `AnalysisObject` | id; instrument/TF; geometry; t_event; known_at; lifecycle; source+rules version | replay uses state knowable at as-of (prefix-equality test) |
| `IntelligenceInsight` | id; sourceEngine/version; kind∈{observation,interpretation,scenario,forecast,risk_warning}; status∈{proposed,active,confirmed,invalidated,expired}; observedAt/availableAt; evidenceIds; objectRefs; provenanceId | separates observation/interpretation/scenario/forecast |
| `ScenarioSpecification` | id/version; asOf; branches; conditions; invalidation; expiry; geometry refs | frozen before outcome; prediction only with a valid model |
| `MarketEvent/Feature` | eventTime; publishedAt; receivedAt; availableAt; data version; quality | point-in-time joins; no future leaks |
| `RunManifest` | strategy hash; dataset/model/features/costs/seed/env; spec hash | reproducible immutable results |
| `Trade & Opportunity` | decision id; opportunity id; eligibility; rejected reason; trade legs; cost/version | no survival bias — log rejected + eligible, not only executed |
| `ViewManifest` | scope; source object ids; layers; priority; time window; evidence links | rendering cannot modify original analysis |
| `AuthorizationDecision` | actor; action; permission; source/version; timestamp; rationale | VAULT + live risk gates enforced server-side |

**The 5-type distinction (separate types AND screens):** `AnalysisObject` (geometric/technical evidence) · `Insight` (connects evidence) · `Scenario` (explicitly conditional proposed future) · `Signal` (defined + validated strategy logic) · `Order` (authorized operational instruction).

---

## PART IV — CAPABILITY ALLOCATION (the 36 features → owners)

Catalog items are **features of bounded engines**, not 36 backends. Each has an owner + a guardrail; most surface through Canvas/Desk.

- **Institutional-inspired (CONDITIONAL on data):** Liquidity Heatmap → Liquidity Intelligence/Canvas (price proxy only; real book needs venue feeds) · Options Expiry & Barrier → Options/Macro context (licensed data) · Cross-Asset → Relay+Desk (timestamp alignment) · Market Impact Monitor → Execution & microstructure · Institutional Session Footprint → Session Intelligence (no inferred participant identity) · Volatility Surface → Options/Model Registry (licensed).
- **Advanced analysis:** Market Auction → Auction/volume (FX central volume unavailable → proxy labels) · Market Efficiency → statistical market-state (descriptive until validated) · MTF Conflict Radar → Evidence Relationship Engine (highlight, never average) · Transition Detector → Regime (measure lag + stability) · Liquidity Journey Mapper → Session/structure + Canvas · Relative Currency Strength → Cross-asset features/Desk.
- **Smart chart:** Chart X-Ray → Canvas investigation · Future Decision Zones → Scenario + overlays · Smart Decluttering → Overlay manager (never delete facts/critical warnings) · One-Click Market Story → Event timeline + replay (recorded vs reconstructed) · Intelligence Comparison → Evidence engine + Canvas (conflicts explicit) · Time-Travel → as-of reconstruction.
- **Prepare/live:** Session Opportunity Radar → Strategy eligibility + session (match ≠ profitability) · Pre-Market Auto-Mapping → Desk Prepare + object mapper · What-Changed-Since-Yesterday → snapshot diff · Scenario Trigger Monitor → Scenario state + events · Trade Readiness Checklist → methodology + risk eligibility (not a validated signal) · Event Impact Tracker → macro events + event study · Session Handover → session engine + Prepare brief.
- **Research tools:** Counterfactual → Research sandbox/Review (hindsight label) · Strategy Compatibility Radar → registry + selector (validated-only for live) · Historical Analogue Finder → research retrieval + Scenario (no cherry-picking) · Market Surprise → anomaly engine (baseline + false-alarm rates) · Evidence Strength & Dependency Map → evidence graph (avoid double-counting) · Forecast Calibration Monitor → model eval + Review (numerical models only).
- **Experimental:** Market Digital Twin → replay/sim state (not a market oracle) · AI Visual Analyst → query + deterministic object actions (no LLM-created geometry) · Dynamic Attention Engine → visual orchestrator/notifications · Scenario Branch Explorer → Scenario Studio/Canvas · Analysis Blind-Spot Detector → evidence coverage/Desk · Decision Compression Engine → Desk brief composer (what matters / next / changes).

---

## PART V — THE DESK VISUAL INTELLIGENCE LAYER

### 12. Intelligence Canvas (a new primary workspace inside Desk, chart ≈70–75%)
Reuses the existing MTF chart engine, crosshair, object geometry, `viewAsOf`. Chart + source list + selected-insight panel + timeline are **synchronized**. Four modes: **Prepare → Explore → Monitor → Review**, shared visual state. The existing free-form Analysis workspace remains the deeper investigation environment.

### 13. The Visual Intelligence Orchestrator + 6 systems (engines never draw directly)
- **Orchestrator** — Normalize · Relate · Prioritize · Deduplicate · Resolve conflicts · Apply visibility policies. Owns visual *coherence*, never *truth*: four engines on one zone → one primary zone + an expandable evidence stack; disagreements are exposed, never averaged.
- **A. Intelligence Object Gateway** — the `IntelligenceInsight` contract (distinct from `AnalysisObject`).
- **B. Smart Overlay Manager** — prioritize, deduplicate, collision-manage, semantic-style, persist visibility; a **clutter budget** collapses secondary objects; critical warnings + invalidations never vanish, even on Simplify.
- **C. Spatial & Temporal Mapper** — a primitive per intelligence type (level/session-shade/event-marker/regime-interval/risk-window/dashed-path/uncertainty-envelope/conflict-indicator); never draws before knowable.
- **D. Scenario & Projection Studio** — conditional paths with explicit triggers/invalidations/horizons; calibrated probabilities only from validated models; a *path* ≠ an *executable setup*.
- **E. Intelligence Timeline & Replay** — replays the evolution of intelligence; distinguishes live-recorded vs reconstructed.
- **F. Visual Query System** — NL → structured queries over the evidence graph → deterministic chart ops; the LLM selects verified objects, never invents geometry.

### 14. Display priority policy (Experience Plane)
- **P0 safety** (stale feed, invalidation, imminent scheduled-event risk, authorization failures) — always visible.
- **P1 actionable** (selected instrument, user plan, relevant scenario triggers).
- **P2 evidence** (supporting/contradictory structure + liquidity; one-click detail).
- **P3 background** (research features, full vectors, raw metrics — behind drill-down).
Budget by screen task + chart density; collapsed objects keep source identity. **Personal visibility controls never disable risk alerts or detection — presentation only.**

### 15. Experience-plane surfaces (what each shows / hides)
Desk/Prepare (guided 6-step chart-linked walk → plan freeze) · Desk/Live (full market map, thesis delta, critical event + trigger feed, risk strip) · Intelligence Canvas (layer presets, evidence inspection, visual scenarios, source toggles, time travel) · Desk/Explore (free MTF charts, query-driven investigation) · Desk/Review (decision timeline, as-of replay, process/outcome separation) · Scan (strategy discovery, trial scans) · Relay (cross-asset research; **no duplicated Judge**) · Research Workbench (hypotheses, DAG jobs, strategy versions, validation, registries) · Portfolio Command (allocation, exposure, eligibility, suspension) · Ops & Data Observatory (feed quality, broker sync, compute jobs, model drift — expert access).

---

## PART VI — THE PHASED DEVELOPMENT PLAN

**Conventions (repo rules):** one phase per working session; pure logic → wiring → chrome; additive & backward-compatible; typecheck/tests/build green; mock-first on the frontend so it never blocks on the backend; report files touched; never auto-start the next phase. Each phase lists **Deliverable · Owner context · Depends · Definition of Done (DoD) · Test plan.** Waves are groupings; phases inside a wave can parallelize across backend/frontend.

### WAVE 0 — Decisions & Foundations (unblocks everything)
| Phase | Deliverable | Owner | Depends | DoD | Test |
|---|---|---|---|---|---|
| W0.1 | **Resolve the 10+2 open decisions** (Part VIII) into a short `docs/DECISIONS.md` | — | user input | each decision has a chosen option + rationale | n/a |
| W0.2 | **Canonical market clock + point-in-time model** (`core/market-clock`, `core/data-quality`): add `eventTime/publishedAt/receivedAt/availableAt` + dataset versioning/provenance to ingestion | Data Foundation | W0.1 | every ingested row carries the 4 times + data version | no-future-leak unit test; existing `data/` tests green |
| W0.3 | **Unify the cost model** (OQ-1): pick one baseline (recommend `scalp_engine.py` real bid/ask), add `cost_model_version` to all engine outputs, document the fair/random reference line (OQ-2) | Research OS | W0.1 | one cost basis across engines; golden tests reproduce known numbers | `engine/tests/test_golden.py`, `backtest/tests/*` green; new baseline-reproducibility test |
| W0.4 | **Identity + the canonical-record contracts** (`core/identity`, `core/events`): zod/pydantic schemas for the 8 records + the 5-type distinction, shared FE/BE | all | W0.2 | schemas published + parity between FE zod and BE pydantic | contract tests from fixtures; `frontend/src/types/contractV2.test.ts` pattern |

### WAVE 1 — Research Operating System hardening (reuse + extend `engine/`)
| Phase | Deliverable | Owner | Depends | DoD | Test |
|---|---|---|---|---|---|
| W1.1 | **Strategy Specification + registry/version library** (Contract 1): typed spec + Python-plugin interface; version = ledger spec hash; structural diff + duplicate detection | Strategy/Research | W0.4 | a strategy authored as spec compiles + registers; variant → new version | spec-compiles test; duplicate-detection test; `engine/tests` green |
| W1.2 | **Strategy Compiler + Static Analysis**: reject invalid/contradictory/future-data/unbounded-lookback; sandbox generated Python (allowlist, resource limits, isolated workers) | Research OS | W1.1 | invalid specs rejected pre-backtest with an inspection report | static-check unit tests; sandbox escape test |
| W1.3 | **Run Manifest + Artifact Store** (Contract 2): wire `freeze_spec`; immutable bundle per run | Research OS | W0.3,W1.1 | every run produces a reproducible manifest | same-manifest-reproduces test within tolerance |
| W1.4 | **Evidence tiers + verdict record extension**: derive `exploratory/in_sample/validated/vault_confirmed` over existing facts; persist fdr_alpha/split/data_version/code_commit on results; promotion-history view | Research OS | W1.3 | tiers computed; promotion history listable | tier-transition tests on a fixture ledger; `engine/tests/test_ledger.py` green |
| W1.5 | **Research Workflow Orchestrator (DAG jobs)** + async HTTP job API: experiments as DAGs w/ dependencies, retries, checkpoint/recovery, quotas, idempotency, immutable results, approval points; survive restart | Research OS | W1.3 | a multi-step experiment runs as a DAG; `POST /jobs`→202, poll to result; vault job refused without `final_confirmation` | job-lifecycle test; restart-recovery test; vault-guard test |
| W1.6 | **Research Knowledge Graph** (relational tables first): strategy↔hypothesis↔failure↔experiment↔dataset↔model relations | Research OS | W1.4 | relationships queryable ("which families failed?") | relationship-integrity tests |

### WAVE 2 — Trade Intelligence (the plan's "build first" value)
| Phase | Deliverable | Owner | Depends | DoD | Test |
|---|---|---|---|---|---|
| W2.1 | **`TradeRecord` 4-category decision/opportunity ledger**: executed trades · rejected setups · eligible opportunities · counterfactuals; enrich `ScalpTrade` with regime_snapshot_id + decision_trace + lineage; add slippage/commission fields | Strategy/Trade | W0.4,W1.3 | every backtested decision persists a typed record across 4 categories | schema completeness test; survival-bias test (rejected logged) |
| W2.2 | **Reports**: loss taxonomy, **regime-conditioned performance with `insufficient_sample` flag** (n<30), potential-trade analysis, strategy comparison, data-integrity report | Trade Intelligence | W2.1 | reports computed per strategy; small cells flagged | report-correctness tests on fixtures |
| W2.3 | **Trade endpoints**: `GET /trades`, `/trades/{id}`, `/reports/*` (reads) + fixtures | Trade Intelligence | W2.1 | endpoints return real records; fixtures frozen | `api/tests` contract tests |
| W2.4 | **FE: Trade-Intelligence panel + journal popout** (`?window=journal`), mock→api | Experience | W2.3 | panel renders records; trade deep-link works | `*.test.tsx` + fixture parse; 124-suite green |

### WAVE 3 — Market & Regime Intelligence
| Phase | Deliverable | Owner | Depends | DoD | Test |
|---|---|---|---|---|---|
| W3.1 | **Causal `RegimeSnapshot` v0.1** (rule-based, wraps `market_context/context.py`): direction/trend/vol/structure/momentum/transition + `available_at`; separate *regime* vs *HTF bias* vs *execution conditions* | Market Intelligence | W0.2,W0.4 | snapshot is pure + causal | no-future-leak adversarial test (mirror `engine/tests/test_adversarial.py`) |
| W3.2 | **Regime diagnostics** (independent research programme): stability, switch-rate, early-detection, cross-instrument consistency, calibration, after-cost value, detect-vs-describe | Market Intelligence | W3.1 | diagnostics computed + reported | diagnostic-metric tests |
| W3.3 | **Analytical families** (configurable, feed context panels not chart clutter): trend/momentum, volatility, statistical behaviour, relative strength; CONDITIONAL: volume/auction, options | Market Intelligence | W3.1 | families produce `AnalysisObject`/`IntelligenceInsight` with provenance | per-family detector tests |
| W3.4 | **Evidence Relationship & Contradiction Engine**: independent vs correlated vs contradictory vs unavailable vs contextual; dependency groups; no probabilities unless calibrated | Visual/Market Intelligence | W3.3 | correlated detectors (BOS+displacement+FVG from one impulse) counted once | dependency-dedup test |
| W3.5 | **FE: Regime strip + analytical-family context panels** in Desk | Experience | W3.1 | regime shown at viewed time; `available_at` respected | widget + causal fixture tests |

### WAVE 4 — Scenario Intelligence
| Phase | Deliverable | Owner | Depends | DoD | Test |
|---|---|---|---|---|---|
| W4.1 | **`ScenarioSpecification` + lifecycle** (frozen before outcome; triggers/invalidations/horizons/expiry; geometry refs) | Scenario | W0.4 | scenarios authored + versioned; lifecycle enforced | lifecycle-state test; frozen-before-outcome test |
| W4.2 | **Scenario trigger engine + projection geometry** (categories A observed / B conditional / C validated-forecast-only) | Scenario | W4.1 | triggers fire/expire/invalidate; no fabricated % | honesty test (no probability without a validated model) |
| W4.3 | **Historical Analogue Finder + Forecast Calibration Monitor** (CONDITIONAL on validated models) | Scenario | W4.2,W3.2 | analogues return outcome ranges; calibration tracked | no-cherry-pick test; calibration-tracking test |

### WAVE 5 — Desk Visual Intelligence 2.0 (Intelligence Canvas; supersedes DK21 forward work)
| Phase | Deliverable | Owner | Depends | DoD | Test |
|---|---|---|---|---|---|
| VI-0 | **Unified Intelligence Contracts**: `IntelligenceInsight`, geometry refs, provenance, timestamps, evidence relationships (FE+BE) | Visual Intelligence | W0.4 | contracts published + parity | contract tests |
| VI-1 | **Intelligence Canvas shell**: large-screen layout, chart-focused interaction, source browser, overlay presets | Experience | VI-0 | shell renders; chart ~70% ; source list synced | layout + sync tests |
| VI-2 | **Chart Mapping Engine**: normalize existing `desk/detect` + session intelligence into `ChartMapping` visual instructions | Visual Intelligence | VI-0 | an insight → highlighted geometry + focus + evidence | mapping-correctness test; "never draw before knowable" test |
| VI-3 | **Visual Orchestrator**: dedup, prioritization, collision handling, contradictions, clutter budget | Visual Intelligence | VI-2 | overlapping zones consolidate w/ evidence stack; warnings never hidden | dedup + clutter-budget tests |
| VI-4 | **Scenario Studio** (Canvas mode): conditional paths, triggers, invalidations, horizons, lifecycle (uses Wave 4) | Experience | VI-3,W4.2 | selecting a scenario updates main chart | scenario-render + honesty tests |
| VI-5 | **Prepare/Live integration**: 6-step guided prep → frozen session map; Live diffs events vs plan; Before/Now compare | Experience | VI-3,W3.1 | prep snapshot becomes Live's start state | prep-freeze + live-diff tests |
| VI-6 | **Intelligence Timeline + Replay**: event history, as-of replay, recorded-vs-reconstructed labels | Experience | VI-0,W1.5 | replay rehydrates objects+insights at as-of | replay/live-parity test |
| VI-7 | **Cross-engine integration**: Regime, strategy, trade, macro, (future) Master Brain outputs onto Canvas with distinct visual identities | Visual Intelligence | VI-3,W2.x,W3.x | each engine's output renders distinctly; discretionary ≠ validated | per-source visual-identity test |
| VI-8 | **Visual Query Assistant**: NL → structured evidence retrieval → deterministic chart ops | Visual Intelligence | VI-7 | query focuses chart + opens evidence; LLM invents no geometry | query-determinism test |
| VI-9 | **Production hardening**: perf (60 FPS, ~100ms toggles), accessibility (semantic styling not color-only), security, observability, parity tests, failure recovery | all | VI-8 | targets measured on realistic object counts | perf/a11y/parity benchmark suite |

### WAVE 6 — Master Research Brain (authoring over the Judge; LLM proposes only)
| Phase | Deliverable | Owner | Depends | DoD | Test |
|---|---|---|---|---|---|
| W6.1 | **Brain contracts + console (FE)** early: Research Planner / Evidence Analyst / Hypothesis Generator / Strategy Developer / Experiment Designer / Orchestrator / Research Memory as separated responsibilities | Research OS/Experience | W1.5 | contracts + console exist before autonomy | contract tests |
| W6.2 | **Hypothesis → sandbox strategy draft → test plan → `ledger.register`** (human-approved) | Research OS | W6.1,W1.2 | a proposal becomes a registered experiment; no auto-promote | "cannot write a verdict / cannot reach load_vault" test |
| W6.3 | **Persistent Research Memory** over the knowledge graph (what was tried, incl. negatives) | Research OS | W1.6,W6.2 | memory answers "already investigated?" | memory-recall test |

### WAVE 7 — Strategy / Trade / Portfolio Intelligence
| Phase | Deliverable | Owner | Depends | DoD | Test |
|---|---|---|---|---|---|
| W7.1 | **Expose coordinator + validated-only Selector** (`GET /coordinator`, shadow): exclude unvalidated strategies | Strategy/Trade | W1.4 | recommendation served; only validated eligible | `agents/tests/test_coordinator.py` green + eligibility-gate test |
| W7.2 | **Portfolio Intelligence + Simulator**: one shared clock/account/margin/execution; cross-strategy dependence, currency exposure, portfolio DD/tail, allocation under limits | Strategy/Portfolio | W7.1 | portfolio equity from combined decisions (not summed returns) | portfolio-simulator correctness test |
| W7.3 | **Strategy Lifecycle & Decay Monitoring**: Candidate→Validated→Shadow→Active→Suspended→Retired; statistically-justified thresholds; suspend without code change, audited reason | Strategy/Safety | W7.1 | lifecycle transitions enforced + audited | decay-threshold + suspension-audit tests |

### WAVE 8 — Safety & Execution (gates any future live)
| Phase | Deliverable | Owner | Depends | DoD | Test |
|---|---|---|---|---|---|
| W8.1 | **Stateful Risk/Safety module**: kill switch, daily-loss, max-DD, exposure cap; backend-enforced vetoes | Safety | W0.4 | limits enforced in a sim harness; veto beats everything | limit-enforcement tests |
| W8.2 | **Shadow mode**: live inputs, logged proposed selections + hypothetical fills, simulated-vs-observed distinction; no orders | Safety/Experience | W8.1,W7.1 | shadow runs end-to-end, no orders possible | "no order path reachable" test |
| W8.3 (DEFER) | **Broker adapter + micro-live** (0.01 lot) — only after separate human authorization | Safety | W8.2 | gated behind explicit authorization + kill switch | reconciliation + kill-switch drill |

### WAVE 9 — Scenario/Scenario-lab robustness, Scenario laboratory, Execution-sim fidelity, Compute
| Phase | Deliverable | Owner | Depends | DoD | Test |
|---|---|---|---|---|---|
| W9.1 | **Execution Simulation Laboratory** (fidelity L1 candle → L2 bid/ask → L3 tick → L4 stress); label fill assumptions when no depth data | Safety/Research | W0.3 | a strategy compared at one fidelity level | fidelity-parity tests |
| W9.2 | **Scenario & Robustness Laboratory**: spread/slippage/delay/param/period/provider perturbations → robustness profile per version | Research OS | W1.3 | each strategy version gets a robustness profile | robustness-profile tests |
| W9.3 | **Feature Registry + point-in-time feature store**: shared feature defs + versions (fix duplicated ATR/vol/swing/momentum across `ta_engine`/`forecast`/`desk/kernel`) | Data/Market Intelligence | W0.2 | one versioned definition per feature; parity across modules | cross-module feature-parity tests |
| W9.4 | **Model Registry** (regime/forecast/anomaly models, separate from Strategy Registry): training data, calibration, versions, drift, deployment | Research OS | W3.2 | models versioned + drift-tracked | model-version/drift tests |
| W9.5 | **Distributed Research Compute**: quotas, parallel workers, content-addressed caching, early termination, priority queues, compute/token budgets, experiment dedup | Research OS | W1.5 | experiments deduped before running; budgets enforced | dedup + budget tests |

### Event-driven backbone (cross-cutting, lands with Wave 1 and matures through Wave 9)
Durable queue / transactional outbox for facts (`dataset.ready`, `experiment.registered`, `backtest.completed`, `validation.completed`, `strategy.approved/suspended`, `regime.model_updated`). Distinguish commands (`RunExperiment`) from facts (`ExperimentCompleted`) to prevent duplicate execution and keep workflows auditable. No in-memory bus for results that must survive restart.

---

## PART VII — CROSS-CUTTING CONCERNS

### 16. Observability, security, permissions (first-class, every wave)
- Correlated logs/metrics/traces across ingestion, model inference, backtests, jobs, APIs.
- Every automated action carries actor + permission + run-id + audit (`AuthorizationDecision`).
- LLM-generated code runs in isolated workers with restricted filesystem/network/credentials/resources; a prompt or generated strategy can **never** modify the Judge, unlock the VAULT, or touch broker credentials.

### 17. Performance & reproducibility
- Targets (measure before locking): 60 FPS chart interaction on target desktop; overlay toggles ~100ms; incremental updates that don't block the chart thread; incremental computation (no full-market recompute per tick); chart rendering budgets for hundreds of objects.
- Reproducibility via `RunManifest` + content-addressed artifacts; replay/live parity tested.

### 18. Backend-authoritative analytics + replay/live parity
Shared analytical *specifications* across replay/live/research with **parity tests** (golden fixtures + prefix-causal harness). The browser is not the permanent authoritative engine; `desk/detect` + `desk/kernel` migrate toward the shared core while keeping behaviour + tests. Relax "Desk state never replicated" only for immutable plans/decisions/evidence snapshots/review records (durable storage + sync); personal UI state stays local.

---

## PART VIII — OPEN DECISIONS (resolve in W0.1 before sequencing)
1. **Target users** — single expert discretionary trader vs multi-user research team (→ permission model). 2. **Data subscriptions** — broker-only FX vs licensed options/order-books/macro. 3. **Instruments** — 5 majors vs broader + metals + indices. 4. **Authority** — decision-support vs shadow-only vs authorized live execution. 5. **Execution environments** — local Mac + deployable workers (→ deterministic packaging). 6. **Sharing** — local prefs vs synchronized plans/decision artifacts. 7. **Visual design** — reuse theme tokens first vs design-system overhaul. 8. **Regime forecasts** — deterministic descriptors first; statistical probability only after validated evaluation. 9. **Research controls** — approval workflow, Judge settings, VAULT role ownership. 10. **Licensing & retention** — third-party feed limits, source + model-output retention. Plus **OQ-1** cost model and **OQ-2** reference line from `INTEGRATION_DESIGN.md`.

---

## PART IX — ACCEPTANCE TESTS (integration-level, enforced across waves)
As-of equality (no future leak / post-hoc upgrade invisible historically) · overlay source traceability · contradictions stay unmerged · missing input degrades gracefully (never fabricates) · scenario honesty (probabilities only for evaluated models) · recorded-live vs reconstructed labeled · research reproducible from manifest + audited holdout access · live selection/risk cannot be bypassed by Desk/LLM/workflow/query/overlay · operational faults visible + recoverable · usability: answer "what matters / what next / what invalidates" in seconds on a clean default chart.

---

## PART X — RISKS & MITIGATIONS
1. **Feature overload destroys usability** → Overlay Manager + Attention + Decision-Compression are foundational; P0–P3 display budget; mock-first UX with real traders in the loop.
2. **Sophisticated ≠ profitable** → institutional/analogue features are CONDITIONAL, gated behind data rights + empirical validation; nothing ships as "signal" without the Judge.
3. **Integration complexity → modules disagree** → the 8 canonical records + one clock + parity tests + the 5-type distinction, enforced from Wave 0.
4. **Underpowered statistics** → sample-size floors + `insufficient_sample` flags + FDR + family/reuse controls; surface "most strategies won't clear" honestly.
5. **Scope creep stalls delivery** → Waves 0–2 deliver real value (contracts + Trade Intelligence + journal) before the big visual/brain waves; each phase is independently shippable and reversible.

---

## PART XI — APPENDICES

### A. Candidate code namespaces (planning names; extend existing packages, no 2nd TA/Judge stack)
`core/{data-quality,market-clock,features,identity,events}` · `intelligence/{technical,session,liquidity,regime,cross-asset,macro,options,auction,anomaly}` · `scenarios/{specs,trigger-engine,analogues,forecasts}` · `research/{hypotheses,compiler,workflows,artifacts,judge-adapter,models}` · `trading/{strategy-registry,opportunities,trade-intel,portfolio,execution,risk}` · `visual/{gateway,evidence-graph,attention,overlays,queries}` · `frontend/{desk,scan,relay,research,portfolio,observability}`. Frontend Canvas: `frontend/src/desk/canvas/{chart-mapping,overlay-manager,rendering,interactions,presets,timeline,query}`.

### B. Tests that must stay green (regression safety net)
Backend: `engine/tests/*` (ledger, partition, judge, runner, adversarial, golden, end_to_end; `test_datacache.py` needs DB) · `backtest/tests/{test_engine,test_scalp_engine,test_risk,test_currency}.py` · `agents/tests/{test_agents,test_coordinator}.py` · `api/tests/test_api.py` · `market_context/tests/*` · `ta_engine/tests/*`. Frontend: the 124-file suite incl. `types/schemas.test.ts` + `contractV2.test.ts` + the DESK detector/contract tests.

### C. Glossary (key terms)
AnalysisObject · IntelligenceInsight · ScenarioSpecification · RunManifest · ViewManifest · AuthorizationDecision · evidence tier (exploratory/in_sample/validated/vault_confirmed) · fair/random reference line · as-of / viewAsOf · the 5 types (Object/Insight/Scenario/Signal/Order) · bounded context · the planes (data/analytics/research/strategy-risk/evidence-orchestration/UX).

### D. Source register
SOURCE-DERIVED: `INTEGRATION_DESIGN.md`, `DESK_DESIGN.md`, `DESK_PHASES.md`, `forex_trading_intelligence_system_plan.docx`, `Spekrym_FX_Unified_System_Blueprint.docx`, `forex_market_regime_research_guide.md`, plus the 2026-10-22 code audit. CONVERSATION-DERIVED: visions A–E (research OS, DESK intelligence, chart-native, Intelligence Canvas, feature catalog + 8 domains). PROPOSED: bounded contexts, contracts, phase sequencing, acceptance tests — all require design review, data feasibility, and empirical validation. No claim of a unique institutional technique or guaranteed edge.

---

*This is a living plan. It is not an authorization to build; Wave 0.1 (resolve the open decisions) comes first, then phases are executed one per session under the repo's working rules, preserving every test contract in Appendix B.*
