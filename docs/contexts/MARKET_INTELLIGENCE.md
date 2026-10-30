# Context Deep-Dive — Market Intelligence (Bounded Context #2)

Part of `docs/MASTER_DEVELOPMENT_PLAN.md` (Part II §5, context #2). Companion to the sibling context docs. Tags: **EXISTS / EXTEND / NEW / CONDITIONAL / DEFER**; evidence `[VERIFIED path:line]` (read 2026-10-22), `[DOC]`, `[PROPOSED]`.

> **One-line role:** turn point-in-time market data into versioned, causal *descriptions* of the market — objects, regime, context — with provenance and evidence, and **never** into a trade decision.

---

## 1. Mission & boundary

**Owns.** Everything that *interprets* the market without choosing a trade: technical object detection (structure, S/R, supply/demand, liquidity/sweeps, FVG/imbalance, price action), session & liquidity analysis, **market regime** (direction / trend / volatility / structure / momentum / transition), cross-asset & relative-strength, macro/event context, and (CONDITIONAL) options / auction / anomaly analyses.

**Produces.** Versioned `AnalysisObject` (geometric/technical evidence), `RegimeSnapshot` (market-state vector), `IntelligenceInsight` (an interpretation linking evidence), `ContextInsight` (macro/cross-asset context) — all causal (`available_at`) and with provenance + detector/rules version.

**Explicitly does NOT own:**
- The *data* it reads — that is [Data Foundation](./DATA_FOUNDATION.md).
- *Scenarios / forecasts* about the future — that is [Scenario Intelligence](./SCENARIO_INTELLIGENCE.md) (this context describes *now* and *the past*, causally).
- *Strategies, signals, eligibility* — that is [Strategy / Trade / Portfolio](./STRATEGY_TRADE_PORTFOLIO.md). A detected object or a regime label is **not** a signal.
- *How things are drawn* — that is [Visual Intelligence](./VISUAL_INTELLIGENCE.md). This context emits facts + geometry refs; it never decides overlay styling or priority.

Boundary rule: *Market Intelligence answers "what is the market doing, and what can we observe about it, causally?" — not "what should I trade?"*

---

## 2. Current state (audited)

The decisive finding: **two parallel analytical stacks exist**, and unifying them behind one shared, parity-tested specification is the central job of this context.

- **Backend, rule-based (Python):** `market_context/` — a causal multi-timeframe *snapshot*.
- **Frontend, richer causal engine (TypeScript):** `desk/detect` (6 layers) + `desk/kernel` — the DESK analytical engine, DK2–DK11, with `viewAsOf` and a no-lookahead harness.

| Capability | Status | Evidence |
|---|---|---|
| Backend causal MTF snapshot (`build_context` pure; `get_market_context` loads D1/H4/H1) | **EXISTS** | `[VERIFIED market_context/context.py:30-60]` → `{mtf_trends, mtf_aligned, structure, levels, premium_discount, fvg_active, fvg_inverted, liquidity, displacement}` |
| Trend + BOS/CHoCH (rule-based) | **EXISTS** | `[VERIFIED market_context/structure.py:17-39]` (`_classify_trend` HH+HL→bullish; BOS vs CHoCH labelled) |
| Backend detectors: levels (PDH/PDL/PWH/PWL/sessions), imbalance (FVG/iFVG), premium/discount, liquidity pools, displacement | **EXISTS** | `market_context/{levels,imbalance,premium_discount,liquidity,displacement}.py` |
| SMC detectors single-sourced + facts aggregation | **EXISTS** | `[VERIFIED ta_engine/smc.py:5]` (`detect_bos`, `detect_order_blocks`); `ta_engine/facts.py:14` `build_facts` |
| **Frontend 6-layer causal detector engine** (structure, levels=S/R+reference, liquidity=pools+sweeps, fvg, sd=supply/demand, pa=price-action: trendlines/range/premium/signals) | **EXISTS** | `[VERIFIED frontend/src/desk/detect/{structure,levels,liquidity,fvg,sd,pa}/*]`; registry `registry.ts:59 detectAll` (memoised) |
| Causal kernel (atr, swings, displacement, closedBars, **viewAsOf**, no-lookahead **harness**) | **EXISTS** | `[VERIFIED frontend/src/desk/kernel/{atr,swings,displacement,closedBars,viewAsOf,harness}.ts]` |
| `AnalysisObject` with geometry/t_event/known_at/confirmed_at/lifecycle/provenance, **grade.significance separate from the object** | **EXISTS** | `[VERIFIED frontend/src/desk/types/schemas.ts:76-83, 47-54]` (detection ≠ grading) |
| Evidence relations (object-to-object) | **EXISTS (partial)** | `[VERIFIED frontend/src/desk/detect/relations.ts]`; confluence `desk/confluence/*` (DK12) |
| Versioned methodology (editable detector params) | **EXISTS (partial)** | `desk/methodology/{methodologyStore,params,MethodologyEditor}.tsx` (DK17); defaults `desk/methodology/defaults.ts` |
| Volatility "regime" (ATR band) | **EXISTS (scattered)** | `[VERIFIED agents/technical_tree.py:131-150]` `VolatilityAgent` dead/normal/expanding |
| `atr_regime` ML feature | **EXISTS (scattered)** | `[VERIFIED forecast/features.py:45]` (ATR14 / 50-rolling mean) |
| **Unified `RegimeSnapshot` vector + `available_at`** | **MISSING** | no single multi-dimensional regime object anywhere |
| **Regime diagnostics** (stability, calibration, after-cost value, detect-vs-describe) | **MISSING** | — |
| **HMM / change-point / clustering** | **MISSING** | `[VERIFIED grep market_context,forecast,agents: none]` |
| **Analytical families beyond SMC** (trend-quality/momentum, volatility state, statistical behaviour, relative strength, auction/volume, options) | **MISSING/partial** | only SMC/price-action family is deep |
| **Shared analysis core + parity tests** (one spec across backend/frontend) | **MISSING** | two stacks compute overlapping things independently |

**Honest gaps that matter most:** (a) the frontend engine is richer and causal, but it runs **client-side** and is a *second* implementation of what `market_context/` partly does — no parity guarantee; (b) regime is three disconnected fragments, not one calibrated, causal vector; (c) the methodology defaults are conventions presented as settings, not empirically evaluated.

---

## 3. Internal components / modules

| Component | Responsibility | Today | Target |
|---|---|---|---|
| **Technical detectors** (structure, S/R, S/D, liquidity, FVG, price action) | Emit `AnalysisObject`s with geometry + lifecycle | EXISTS twice (`market_context/*` + `desk/detect/*`) | UNIFY behind one shared spec; parity-tested |
| **Causal kernel** (atr/swings/displacement/closedBars/viewAsOf/harness) | No-lookahead primitives + prefix-equality test | EXISTS (`desk/kernel`) | promote to the shared core; backend parity |
| **Grading** (significance) | Score an object's importance *separately* from detecting it | EXISTS (`schemas.ts` Grade) | EXTEND per analytical family |
| **Regime engine** (`regime/`) | One causal `RegimeSnapshot` vector + diagnostics | **NEW** (fragments in `structure.py`, `VolatilityAgent`, `atr_regime`) | direction/trend/vol/structure/momentum/transition + separate HTF-bias vs execution conditions |
| **Analytical families** | Configurable trend/momentum, volatility, statistical, relative-strength, (CONDITIONAL) volume/auction/options | **NEW/partial** | feed context panels, not chart clutter |
| **Evidence Relationship & Contradiction Engine** | Classify evidence independent/correlated/contradictory/unavailable/contextual | EXISTS partial (`relations.ts`, confluence) | EXTEND: dependency groups; dedup correlated |
| **Methodology registry** | Detection spec vs profile vs empirical eval vs presentation policy | EXISTS partial (`desk/methodology`) | EVOLVE → versioned registry (multiple profiles) |

---

## 4. Owned records & contracts (field-level)

### `AnalysisObject` (EXISTS — `frontend/src/desk/types/schemas.ts`, promote to shared core)
```
AnalysisObject {
  id; type; instrument; tf
  geometry                     # price/time geometry (the chartable truth)
  t_event: int                 # when it happened
  known_at: int                # when it became knowable (causal)        [VERIFIED schemas.ts:78]
  confirmed_at: int | null     # when provisional → final                [VERIFIED schemas.ts:79]
  lifecycle: LifecycleEvent[]  # formed/mitigated/invalidated/...         [VERIFIED schemas.ts:80]
  grade?: { significance: number | null, ... }   # SEPARATE from detection [VERIFIED schemas.ts:47-54,82]
  provenance                   # detector + rulesVersion                  [VERIFIED schemas.ts:83]
}
```
Invariant: an object is never deleted for low significance; detection and presentation are different concerns.

### `RegimeSnapshot` (NEW — unifies the scattered fragments)
```
RegimeSnapshot {
  id; instrument; t_event; available_at                 # causal
  direction: { bullish_p, bearish_p, neutral_p }        # today: rule trend → one-hot (structure.py)
  trend_strength: number                                 # EXTEND _classify_trend / efficiency ratio
  volatility_state: dead|normal|expanding|extreme        # EXTEND VolatilityAgent band [technical_tree.py:145]
  structure_state: trend|range|compression|transition    # EXTEND BOS/CHoCH [structure.py:40]
  momentum_state: strengthening|stable|fading            # NEW
  transition_risk: number                                # NEW (change score; later change-point)
  timeframe_alignment: aligned|mixed|conflict            # EXISTS mtf_aligned [context.py:~]
  data_quality: valid|degraded|absent                    # from Data Foundation QualityScore
  model_version; rules_version
}
```
Key split: **market regime ≠ higher-timeframe directional bias ≠ execution conditions** are three fields, not one collapsed label (a bullish weekly trend can coexist with a bearish intraday move and a high-vol London session — not a contradiction).

### `IntelligenceInsight` / `ContextInsight`
`IntelligenceInsight` is defined and owned by [Visual Intelligence](./VISUAL_INTELLIGENCE.md) (the gateway); Market Intelligence *produces* instances of `kind: "observation" | "interpretation"`. `ContextInsight` = macro/cross-asset context with availability + source rights.

---

## 5. Interfaces — produces / consumes

| Direction | Counterparty | Contract / purpose |
|---|---|---|
| consumes ← | [Data Foundation](./DATA_FOUNDATION.md) | `MarketEvent` + `availableAt`; causal candle frames; `FeatureRecord` |
| produces → | [Visual Intelligence](./VISUAL_INTELLIGENCE.md) | `AnalysisObject` + `IntelligenceInsight` (geometry refs) — never drawn directly |
| produces → | [Scenario Intelligence](./SCENARIO_INTELLIGENCE.md) | `RegimeSnapshot` + objects that scenarios condition on |
| produces → | [Strategy / Trade / Portfolio](./STRATEGY_TRADE_PORTFOLIO.md) | `RegimeSnapshot` for the selector (eligibility conditions) |
| produces → | [Research OS](./RESEARCH_OS.md) | objects/regime as *features* for experiments (via the feature store) |
| produces → | [Experience Plane](./EXPERIENCE_PLANE.md) | regime strip + analytical-family context panels (via Visual Intelligence) |
| consumes ← | (future) model registry | HMM/change-point model versions for regime dimensions |

---

## 6. Guardrails & invariants
1. **Causal, always.** Every object/insight/regime carries `known_at`/`available_at`; `viewAsOf(t)` returns only what was knowable at *t*, proven by the **prefix-equality no-lookahead test**. `[VERIFIED desk/kernel/harness.ts]` (Rule #1/#6.)
2. **Detection ≠ grading.** A low-significance object still exists and is inspectable; significance is a separate, swappable score. `[VERIFIED schemas.ts Grade]`
3. **Describe, don't decide.** No output of this context is a trade signal; a regime label is not an edge. (Rule #3; aligns with the repo's "a regime label is not a trading edge".)
4. **Correlated ≠ independent.** A bullish BOS + displacement + FVG from one impulse is one piece of evidence with three facets, not three confirmations — the Evidence Relationship Engine enforces this via dependency groups.
5. **Methodology is convention, not truth.** Detector thresholds live in a versioned registry (detection spec / profile / empirical eval / presentation policy); changing a profile never rewrites historical evidence.
6. **One definition, two runtimes.** The shared analysis core is one *specification*; backend and frontend implementations must pass **parity tests** (golden fixtures + prefix-causal harness). No silent fork.
7. **No fabricated probabilities.** Regime probabilities are one-hot/rule-derived until a model is calibrated; only calibrated models emit real probabilities.

---

## 7. Phases that build it (from the Master Plan)

| Phase | Deliverable | Depends | Definition of Done | Test plan |
|---|---|---|---|---|
| **W3.1** | **Causal `RegimeSnapshot` v0.1** (rule-based, wraps `market_context/context.py`): the full vector + `available_at`; separate regime vs HTF bias vs execution conditions | W0.2 (clock), W0.4 (records) | snapshot is pure + causal for any pair/time | no-future-leak adversarial test (mirror `engine/tests/test_adversarial.py`) |
| **W3.2** | **Regime diagnostics** (independent research programme): stability, switch-rate, early-detection lag, cross-instrument consistency, calibration, after-cost value, detect-vs-describe | W3.1, [Research OS](./RESEARCH_OS.md) | diagnostics computed + reported per model version | diagnostic-metric unit tests; calibration test |
| **W3.3** | **Analytical families** (configurable, feed context panels): trend-quality/momentum, volatility state, statistical behaviour, relative strength; CONDITIONAL volume/auction/options | W3.1 | each family emits `AnalysisObject`/`IntelligenceInsight` w/ provenance | per-family detector tests |
| **W3.4** | **Evidence Relationship & Contradiction Engine**: independent/correlated/contradictory/unavailable/contextual; dependency groups; dedup | W3.3 | correlated detectors counted once; contradictions exposed | dependency-dedup test; contradiction-not-averaged test |
| **W3.5** | **FE: regime strip + analytical-family context panels** in Desk (via Visual Intelligence) | W3.1, VI-x | regime shown at the viewed time; `available_at` respected | widget + causal fixture tests; 124-suite green |
| **(cross) W9.3** | Migrate duplicated indicators/detectors behind the **shared analysis core + feature store**; backend↔frontend parity | W0.2, W9.3 ([Data Foundation](./DATA_FOUNDATION.md)) | one definition per detector/feature; parity proven | cross-runtime parity tests (same object on same bars) |
| **(cross) W1.x** | Evolve `desk/methodology` → versioned **Analysis Methodology Registry** (multiple profiles, evidence history unchanged) | W0.4 | multiple profiles selectable; evidence history stable under profile change | profile-switch invariance test |

---

## 8. Context-specific acceptance tests
- **No-lookahead:** `detectAll` over `viewAsOf(full, t)` equals `detectAll` over the prefix up to `t` (already a test family in `desk/detect/*.test.ts`); extend to `RegimeSnapshot`.
- **Detection ≠ grading:** dropping significance to 0 keeps the object present and inspectable.
- **Regime separation:** a bullish weekly + bearish intraday + high-vol London renders as three consistent fields, not a contradiction or an averaged score.
- **Dependency dedup:** BOS+displacement+FVG from one impulse resolves to one dependency group, counted once in confluence.
- **Parity:** the shared structure/liquidity/FVG detector returns identical objects in the backend and frontend runtimes on a golden fixture.
- **Methodology isolation:** switching methodology profile changes *which objects are shown/graded*, never the stored historical evidence.
- **Calibration honesty:** regime probabilities are only non-trivial (not one-hot) when a calibrated model backs them.

---

## 9. Open decisions affecting this context
- **Decision 8 Regime forecasts** — deterministic descriptors first; statistical probability only after validated, calibrated evaluation. Recommended: **ship rule-based `RegimeSnapshot` first (W3.1)**, add HMM/change-point as additional dimensions behind the same contract once W3.2 diagnostics justify them.
- **Shared-core sequencing** — do we unify the two detector stacks *before* adding families (W9.3 early) or build families on the frontend engine first and unify later? Recommended: define the shared *spec* + parity tests early; migrate incrementally so DESK keeps shipping.
- **Decision 3 Instruments** — relative-strength + cross-asset families need the broader instrument set; gated by [Data Foundation](./DATA_FOUNDATION.md) ingest.
- **CONDITIONAL families** — volume/auction (no FX central volume → proxy labels), options (licensed data). Keep as optional plugins with graceful "unavailable".
- **Methodology authority** — who can create/edit methodology profiles, and do profiles sync or stay local (ties to Experience-Plane sharing decision).

---

## 10. Code namespaces & tests to keep green
**Proposed namespaces:** `intelligence/{technical,session,liquidity,regime,cross-asset,macro,options,auction,anomaly}` (backend) + the shared analysis core; frontend detectors stay under `frontend/src/desk/detect` + `desk/kernel` and migrate toward the shared spec.
**Existing to extend:** `market_context/*`, `ta_engine/{smc,facts,support_resistance,price_action}.py`, `frontend/src/desk/{detect,kernel,confluence,methodology}/*`.
**Tests that must stay green:** `market_context/tests/*`, `ta_engine/tests/{test_smc,test_facts,test_price_action}.py`, and the frontend DESK detector/kernel suites (`desk/detect/*.test.ts`, `desk/kernel/harness.test.ts`, `desk/confluence/*`), plus `types/schemas.test.ts`. Parity tests are *added*, not a reason to change existing behaviour.

---

## 11. Cross-context dependencies
- **Reads from** [Data Foundation](./DATA_FOUNDATION.md) (causal candles, features, quality) — the shared feature store (W9.3) is defined there but consumed heavily here.
- **Emits to** [Visual Intelligence](./VISUAL_INTELLIGENCE.md) as `AnalysisObject` + `IntelligenceInsight`; the Evidence Relationship & Contradiction Engine is a *shared concern* — the classification logic lives here, the visual consolidation lives there.
- **Feeds** [Scenario Intelligence](./SCENARIO_INTELLIGENCE.md) (regime + objects that scenarios condition on) and [Strategy / Trade / Portfolio](./STRATEGY_TRADE_PORTFOLIO.md) (regime for the selector).
- **Governed by** [Research OS](./RESEARCH_OS.md): regime models/features are versioned in the model registry and their *predictive* value is judged there — this context describes, the Judge decides.
- **Central tension it resolves:** the backend `market_context/` vs frontend `desk/detect` duplication → one shared, parity-tested analysis core (the DESK-side of vision B's "one set of analytical definitions across replay/live/research").
