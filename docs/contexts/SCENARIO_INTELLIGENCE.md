# Context Deep-Dive — Scenario Intelligence (Bounded Context #3)

Part of `docs/MASTER_DEVELOPMENT_PLAN.md` (Part II §5, context #3). Companion to the sibling context docs. Tags: **EXISTS / EXTEND / NEW / CONDITIONAL / DEFER**; evidence `[VERIFIED path:line]` (read 2026-10-22), `[DOC]`, `[PROPOSED]`.

> **One-line role:** author and evaluate *explicitly conditional* statements about the future — "if X then Y becomes worth monitoring" — with triggers, invalidations, and expiry, and emit a real probability **only** when a validated model backs it. The honest "future read," never a prediction.

---

## 1. Mission & boundary

**Owns.** Conditional scenario authoring; scenario lifecycle (frozen before outcome → triggered/invalidated/expired); projection geometry for the "future scenario space"; historical analogue retrieval; scenario evaluation; and forecast calibration monitoring.

**Produces.** `ScenarioSpecification` (the conditional hypothesis), `ScenarioState` (its live status), `ForecastDistribution` (only from calibrated models). All with `asOf`, triggers, invalidation, horizon, expiry, and geometry refs.

**The three visual categories it governs** (the backbone of this context):
- **A — Observed facts:** historical levels, session highs/lows, confirmed structure, completed sweeps → *not* owned here; these are [Market Intelligence](./MARKET_INTELLIGENCE.md) `AnalysisObject`s that scenarios *reference*.
- **B — Conditional scenarios:** hypotheses with explicit conditions. **Owned here.** Hypotheses, never predictions; no numeric probability.
- **C — Statistical forecasts:** calibrated probabilities / prediction intervals from a *validated* model. **Owned here**, but only surfaced when a model earns it.

**Explicitly does NOT own:**
- Observed objects / regime (that is [Market Intelligence](./MARKET_INTELLIGENCE.md)).
- Whether a scenario is an *executable setup* — a path ≠ a setup; a setup needs strategy logic + execution + risk, owned by [Strategy / Trade / Portfolio](./STRATEGY_TRADE_PORTFOLIO.md).
- How scenarios are *drawn* (dashed paths, zones, envelopes) — that is [Visual Intelligence](./VISUAL_INTELLIGENCE.md); this context supplies geometry refs + semantics.
- Model *training/validation* — that is [Research OS](./RESEARCH_OS.md) + the model registry; this context *consumes* a validated, calibrated model.

Boundary rule: *Scenario Intelligence answers "what could happen under which defined conditions, and what would change the read?" — never "what will happen."*

---

## 2. Current state (audited)

Genuinely **NEW** as a context — there is no scenario specification, lifecycle, or trigger engine today — but three adjacent seeds exist and are reused/evaluated here.

| Capability | Status | Evidence |
|---|---|---|
| Probabilistic directional model (3-class down/flat/up + confidence) — raw material for **Category C** | **EXISTS (adjacent)** | `[VERIFIED forecast/model.py:47-57]` `predict_distribution`; `forecast/predict.py:49` `predict_from_window`; `HistGradientBoostingClassifier` |
| Model eval scaffolding (log-loss, baselines) | **EXISTS** | `[VERIFIED forecast/eval.py:49-50; forecast/train.py:60-66]` |
| Forecast model is **not yet a valid Category-C source** (accuracy ~0.41–0.43, +4.94%/85 trades not significant) | **DOC (honest caveat)** | `[DOC SYSTEM_DOSSIER.md; STRATEGY_FORENSICS.md]` — so it stays qualitative until calibrated + validated |
| Manual single-trade "what-if R" editor (seed for **Counterfactual**) | **EXISTS (adjacent, Scan-side)** | `[VERIFIED frontend/src/components/setups/WhatIfEditor.tsx]` — edits a setup's entry/stop/target → what-if R; "Never the strategy's own result" |
| Object **projection ladder** across TFs (detect-high / project-low) — a *different* "projection" (object visibility, not future paths) | **EXISTS (distinct)** | `[VERIFIED frontend/src/desk/layers/projection.ts:1-3]` — reuse its rendering discipline, not its meaning |
| **`ScenarioSpecification` + lifecycle** (frozen before outcome; triggers/invalidation/horizon/expiry) | **MISSING** | — |
| **Scenario trigger engine** (fire / expire / invalidate against live facts) | **MISSING** | — |
| **Projection geometry** for the future scenario space (conditional paths, reference zones, uncertainty envelopes) | **MISSING** | — |
| **Historical Analogue Finder** (similar past situations → *range* of outcomes) | **MISSING** | — |
| **Forecast Calibration Monitor** (do model probabilities match observed outcomes OOS) | **MISSING** | — |
| **Scenario Studio / Branch Explorer** (Canvas mode) | **MISSING** | — |

**Honest gaps that matter most:** (a) there is nothing to stop the market from being presented as *predicted* rather than *conditioned* — the scenario spec + lifecycle is what enforces honesty; (b) the one probabilistic model present is not validated, so emitting its numbers as a "forecast" would violate the honesty rule until the Calibration Monitor + Judge say otherwise.

---

## 3. Internal components / modules

| Component | Responsibility | Today | Target |
|---|---|---|---|
| **Scenario authoring** (`scenarios/specs`) | Create a `ScenarioSpecification`: branches, conditions, invalidation, horizon, expiry, geometry refs | **NEW** | frozen-before-outcome; versioned |
| **Trigger engine** (`scenarios/trigger-engine`) | Evaluate live facts vs each scenario's conditions → fire / expire / invalidate; emit `ScenarioState` | **NEW** | drives Live monitoring |
| **Projection geometry** | Compute the future-scenario-space geometry (conditional path, reference zone, uncertainty envelope) as *refs* for rendering | **NEW** | reuse `AnalysisObject` geometry conventions |
| **Analogue finder** (`scenarios/analogues`) | Retrieve past situations resembling now → distribution of subsequent outcomes | **NEW** | no cherry-picking; causal retrieval |
| **Forecast calibration** (`scenarios/forecasts`) | Gate Category-C: only calibrated/validated models emit probabilities; track OOS calibration | **NEW** (consumes `forecast/`) | reliability diagrams; sharpness; cost relevance |
| **Counterfactual** | "What would a predefined alternative policy have produced?" clearly labelled hypothetical | **EXISTS seed** (`WhatIfEditor`) | generalise beyond one trade's R into policy counterfactuals (shared with Trade Intelligence) |

---

## 4. Owned records & contracts (field-level)

### `ScenarioSpecification` (NEW)
```
ScenarioSpecification {
  id; version
  instrument; asOf: int                 # frozen at creation — the as-of it was authored under
  kind: "conditional" | "forecast"      # B (conditional) vs C (model-backed)
  branches: [ { label, geometryRefs[],  # e.g. bullish continuation / range / bearish
                conditions[],           # trigger conditions (object/level/structure/regime refs)
                invalidation,           # explicit "what makes this wrong"
                horizon, expiry } ]
  sourceEngine; sourceVersion
  evidenceIds[]; objectRefs[]           # the Category-A facts it conditions on
  modelRef?                             # for kind="forecast": the validated model id (else null)
}
```
Invariant: a spec is **frozen before its outcome is knowable**; any revision is a new version, and the revision history stays visible (no silent edits after the market moves).

### `ScenarioState` (NEW)
```
ScenarioState {
  scenarioId; version; asOf
  status: "proposed" | "active" | "triggered" | "invalidated" | "expired"
  firedConditions[]; brokenInvalidations[]
  observedAt; availableAt               # causal — recorded-live vs reconstructed is distinguished
}
```

### `ForecastDistribution` (NEW — Category C only)
```
ForecastDistribution {
  instrument; asOf; horizon
  modelRef; modelVersion                # MUST be a validated, calibrated model
  distribution | interval               # calibrated probabilities / prediction interval
  calibration: { oosReliability, sharpness, sampleSize }   # from the Calibration Monitor
}
```
Invariant: this record **cannot be produced without a `modelRef` to a validated model**; absent that, the scenario stays `kind: "conditional"` with qualitative evidence only.

---

## 5. Interfaces — produces / consumes

| Direction | Counterparty | Contract / purpose |
|---|---|---|
| consumes ← | [Market Intelligence](./MARKET_INTELLIGENCE.md) | `AnalysisObject` (Category-A facts), `RegimeSnapshot` (conditioning) |
| consumes ← | [Research OS](./RESEARCH_OS.md) / model registry | a *validated, calibrated* model ref for Category-C forecasts |
| consumes ← | [Data Foundation](./DATA_FOUNDATION.md) | causal candles for analogue retrieval + calibration backtests |
| produces → | [Visual Intelligence](./VISUAL_INTELLIGENCE.md) | `ScenarioSpecification`/`ScenarioState` + geometry refs → Scenario Studio rendering |
| produces → | [Experience Plane](./EXPERIENCE_PLANE.md) | the scenario branches shown in Prepare and monitored in Live (via Visual Intelligence) |
| produces → | [Strategy / Trade / Portfolio](./STRATEGY_TRADE_PORTFOLIO.md) | a scenario *may* seed a setup, but only after strategy logic + validation (path ≠ setup) |
| shared with | [Strategy / Trade / Portfolio](./STRATEGY_TRADE_PORTFOLIO.md) | Counterfactual analysis (predefined-alternative-policy evaluation) |

---

## 6. Guardrails & invariants
1. **No fabricated probabilities.** A numeric probability appears only with a `modelRef` to a validated, calibrated model (Category C). Everything else is Category B: conditions + qualitative evidence, no percentages. (Rule: scenario honesty.)
2. **Frozen before outcome.** A scenario's conditions/invalidation are fixed at authoring `asOf`; revisions are new versions and stay visible — you can never retro-fit a scenario to what happened.
3. **Never extend a scenario into the past** as if it had been predicted earlier; projection geometry is drawn forward from `asOf` only.
4. **Path ≠ executable setup.** A conditional path is monitoring guidance; turning it into something tradeable requires strategy logic, execution assumptions, and risk checks owned elsewhere.
5. **Causal analogues.** Analogue retrieval uses only information available at the historical as-of, and returns a *range* of outcomes — never a cherry-picked "this is what will happen."
6. **Recorded vs reconstructed.** A `ScenarioState` recorded live is distinguished from one reconstructed later, so replay never presents hindsight as a real-time call. (Shared with [Visual Intelligence](./VISUAL_INTELLIGENCE.md) replay.)
7. **Lifecycle is explicit.** Expired/invalidated scenarios stop being visually active automatically; a stale hypothesis never lingers as if live.

---

## 7. Phases that build it (from the Master Plan)

| Phase | Deliverable | Depends | Definition of Done | Test plan |
|---|---|---|---|---|
| **W4.1** | **`ScenarioSpecification` + lifecycle**: author branches/conditions/invalidation/horizon/expiry; frozen-before-outcome; versioned | W0.4 (records), W3.1 (regime/objects to condition on) | scenarios authored + versioned; lifecycle states enforced | lifecycle-state test; frozen-before-outcome test (can't edit after outcome without a new version) |
| **W4.2** | **Scenario trigger engine + projection geometry** (categories A ref / B conditional / C validated-only) | W4.1, [Data Foundation](./DATA_FOUNDATION.md) | triggers fire/expire/invalidate vs live facts; geometry emitted as refs | honesty test (no probability without a validated model); trigger-correctness test |
| **W4.3** | **Historical Analogue Finder + Forecast Calibration Monitor** (CONDITIONAL on a validated model) | W4.2, W3.2 (diagnostics), model registry | analogues return outcome ranges; calibration tracked OOS | no-cherry-pick test; calibration-tracking test (reliability vs observed) |
| **VI-4** | **Scenario Studio** (Canvas mode): selecting a scenario updates the MAIN chart; Branch Explorer compares branches side by side | VI-3, W4.2 | a scenario renders as conditional branches w/ trigger + invalidation; selection drives the chart | scenario-render + honesty tests; "updates main chart not a preview" test |
| **(shared) W2.x** | **Counterfactual Analysis** generalised from `WhatIfEditor` to predefined-alternative-policy evaluation (labelled hypothetical) | W2.1 (`TradeRecord`) | a counterfactual policy replays with a hindsight label | counterfactual-labelling test |

---

## 8. Context-specific acceptance tests
- **Scenario honesty:** a Category-B scenario never shows a numeric probability; a Category-C forecast appears only when its `modelRef` points to a validated, calibrated model.
- **Frozen-before-outcome:** attempting to change a scenario's conditions after its outcome is knowable creates a new version and preserves the original; the revision history is visible.
- **No past extension:** projection geometry starts at `asOf`; a test asserts no scenario branch is drawn before its creation time.
- **Lifecycle:** once an invalidation condition fires, `ScenarioState` → `invalidated` and it stops rendering as active.
- **Causal analogues:** the analogue finder, given as-of *t*, uses only ≤ *t* data and returns an outcome distribution, not a single point.
- **Calibration:** on a holdout, Category-C probabilities match observed frequencies within tolerance (reliability diagram); otherwise the model is not promoted to Category C.
- **Recorded vs reconstructed:** replaying a past session labels each `ScenarioState` as live-recorded or reconstructed.

---

## 9. Open decisions affecting this context
- **Decision 8 Regime/forecasts** — deterministic/qualitative first; statistical probability only after validated evaluation. Directly sets when the forecast model (`forecast/`) may become a Category-C source. Recommended: **keep it qualitative (Category B) until the Calibration Monitor + Judge clear it.**
- **Scenario authorship** — who authors scenarios: the trader (discretionary, in Prepare), the Master Brain (as proposals, labelled), or both? Recommended: both, with the Brain's always labelled as proposals (ties to [Strategy / Trade / Portfolio](./STRATEGY_TRADE_PORTFOLIO.md) governance).
- **Analogue similarity definition** — which features define "similar" (regime vector, structure, session)? Needs empirical care to avoid overfitting the similarity metric itself.
- **Counterfactual ownership** — the policy-counterfactual engine is shared with Trade Intelligence; decide whether it lives in `scenarios/` or `trading/trade-intel`. Recommended: shared library, invoked from both.

---

## 10. Code namespaces & tests to keep green
**Proposed namespaces:** `scenarios/{specs,trigger-engine,analogues,forecasts}` (backend); frontend Scenario Studio under `frontend/src/desk/canvas/` (Visual Intelligence owns rendering).
**Existing to reuse/extend:** `forecast/*` (as a *candidate* Category-C model behind the Calibration Monitor, not a direct UI source), `frontend/src/components/setups/WhatIfEditor.tsx` (counterfactual seed), `frontend/src/desk/layers/projection.ts` (rendering discipline for forward geometry — distinct from its object-projection purpose).
**Tests that must stay green:** `forecast/tests/{test_features,test_model}.py`; the frontend Scan/overrides tests that cover `WhatIfEditor`; all DESK layer tests. New scenario tests are additive.

---

## 11. Cross-context dependencies
- **Conditions on** [Market Intelligence](./MARKET_INTELLIGENCE.md): scenarios reference Category-A `AnalysisObject`s and `RegimeSnapshot`s; it never restates them, only links.
- **Gated by** [Research OS](./RESEARCH_OS.md): a Category-C forecast requires a validated, calibrated model from the model registry; the Judge/calibration discipline is what unlocks numeric probabilities.
- **Rendered by** [Visual Intelligence](./VISUAL_INTELLIGENCE.md): Scenario Studio (VI-4) draws conditional branches, reference zones, and uncertainty envelopes from this context's geometry refs — with Category B/C visually distinct.
- **Surfaced in** [Experience Plane](./EXPERIENCE_PLANE.md): scenarios are authored in Prepare (step 5) and monitored in Live (trigger/invalidation feed, Before/Now compare).
- **Shares** Counterfactual analysis with [Strategy / Trade / Portfolio](./STRATEGY_TRADE_PORTFOLIO.md).
- **Hard line:** a scenario is a *conditional future*, one of the five distinct types (Object/Insight/**Scenario**/Signal/Order); it is never silently promoted to a Signal.
