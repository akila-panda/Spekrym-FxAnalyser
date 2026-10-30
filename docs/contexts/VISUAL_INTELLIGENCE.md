# Context Deep-Dive — Visual Intelligence (Bounded Context #7)

Part of `docs/MASTER_DEVELOPMENT_PLAN.md` (Part II §5, context #7). Companion to the sibling context docs. Tags: **EXISTS / EXTEND / NEW / CONDITIONAL / DEFER**; evidence `[VERIFIED path:line]` (read 2026-10-22), `[DOC]`, `[PROPOSED]`.

> **One-line role:** the single layer that turns every engine's output into one clean, honest picture on the chart — normalize, relate, prioritize, deduplicate, resolve conflicts, apply visibility — so engines never draw directly and the chart never lies or clutters.

---

## 1. Mission & boundary

**Owns.** The intelligence gateway (one way for any engine to describe something visualizable); the evidence/dependency graph; visual prioritization + deduplication + collision handling; overlay mapping (facts/insights/scenarios → chart geometry); contradiction + attention services; and the visual query translator.

**Produces.** `IntelligenceInsight` (the common contract engines publish), `ChartMapping` (visual instructions), `ViewManifest` (what a given view shows and why). **Presentation only — it can never alter a source conclusion.**

**Explicitly does NOT own:**
- *The truth of any conclusion* — engines own their calculations + evidence; this context owns visual *coherence*, not correctness.
- *The data/objects/regime/scenarios themselves* — it references them ([Data Foundation](./DATA_FOUNDATION.md), [Market Intelligence](./MARKET_INTELLIGENCE.md), [Scenario Intelligence](./SCENARIO_INTELLIGENCE.md)).
- *The workspaces/modes* (Prepare/Live/Explore/Review) — that is [Experience Plane](./EXPERIENCE_PLANE.md); this context feeds them `ViewManifest`s.

Boundary rule: *Visual Intelligence answers "given everything the engines say, what should the chart show right now, how, and with what evidence — without changing what anything means?"*

---

## 2. Current state (audited)

The **rendering foundations are strong and built** (DK3): an evidence drawer, the `AnalysisObject → Annotation` adapter, object relations (incl. `shared_origin`, the dedup seed), and a layer store with presets/relevance. The **gateway, orchestrator, and canvas are entirely new**.

| Capability | Status | Evidence |
|---|---|---|
| **Evidence drawer** ("why is this here, when was it knowable") | **EXISTS** | `[VERIFIED frontend/src/desk/evidence/EvidenceDrawer.tsx, describe.ts]` |
| **Annotation adapter** `AnalysisObject → Annotation` (chart drawing contract; role→`--role-*` tokens; projected drawn faint + source-TF badge) | **EXISTS** | `[VERIFIED frontend/src/desk/layers/adapter.ts:1-20]` (`ROLE_FOR` map) |
| **Object relations** overlap / nested / contains / **shared_origin** (pure; "nested … never a prediction") | **EXISTS** | `[VERIFIED frontend/src/desk/detect/relations.ts:1-6]` |
| Layer store + presets + relevance + projection ladder (detect-high/project-low) | **EXISTS** | `[VERIFIED frontend/src/desk/layers/{layerStore,layerPresets,relevance,projection}.ts]` |
| Confluence (supports/opposes/unavailable, origin_id dedup) | **EXISTS (partial)** | `frontend/src/desk/confluence/*` (DK12) |
| `viewAsOf` + no-lookahead harness (shared causal spine) | **EXISTS** | `[VERIFIED frontend/src/desk/kernel/viewAsOf.ts, harness.ts]` |
| **Intelligence Object Gateway** (`IntelligenceInsight` contract, distinct from `AnalysisObject`) | **MISSING** | — |
| **Chart Mapping Engine** (`ChartMapping` visual instructions) | **MISSING** | the adapter maps *objects*; nothing maps *cross-engine insights* |
| **Visual Intelligence Orchestrator** (normalize/relate/prioritize/dedup/resolve-conflicts/visibility) | **MISSING** | — |
| **Smart Overlay Manager** (5 jobs + clutter budget) | **MISSING** | layer store does visibility, not prioritization/collision/budget |
| **Spatial & Temporal Mapper** (a primitive per intelligence type) | **MISSING** | adapter covers object geometry only |
| **Dynamic Attention Engine** | **MISSING** | — |
| **Visual Query System** (NL → deterministic chart ops) | **MISSING** | — |
| **Decision Compression Engine** (what matters / next / changes) | **MISSING** | — |
| Canvas/overlay/orchestrator package | **MISSING** | `[VERIFIED find src/desk -iname canvas/overlay/orchestrat: none]` |

**Honest anchors:** the adapter + relations + evidence drawer prove the *discipline* this context needs (no new colours, role tokens, projected-faint, causal evidence, `shared_origin` dedup) — but they operate on one engine's objects. The new work is to generalise that discipline to *every* engine's output via one gateway + orchestrator, without letting any engine draw directly.

---

## 3. Internal components / modules

| Component | Responsibility | Today | Target |
|---|---|---|---|
| **Intelligence Object Gateway** (`visual/gateway`) | One `IntelligenceInsight` contract every engine publishes | **NEW** | distinct from `AnalysisObject` |
| **Evidence/dependency graph** (`visual/evidence-graph`) | Independent/correlated/contradictory/unavailable/contextual; dependency groups | EXISTS partial (`relations.ts` shared_origin, confluence) | EXTEND → full Evidence Relationship & Contradiction Engine |
| **Chart Mapping Engine** (`desk/canvas/chart-mapping`) | Insight → `ChartMapping` visual instruction | EXISTS partial (`adapter.ts` for objects) | generalise to all engines |
| **Visual Orchestrator** (`visual/orchestration`) | Normalize·Relate·Prioritize·Deduplicate·Resolve-conflicts·Visibility | **NEW** | owns coherence, not truth |
| **Smart Overlay Manager** (`desk/canvas/overlay-manager`) | Prioritize, dedup, collision, semantic styling, visibility persistence + clutter budget | **NEW** (extends layer store) | critical warnings never hidden |
| **Spatial & Temporal Mapper** (`desk/canvas/rendering`) | A visual primitive per intelligence type | EXISTS partial (adapter) | levels/sessions/events/intervals/paths/envelopes/conflict markers |
| **Attention Engine** (`visual/attention`) | Prioritize what deserves attention as the market changes | **NEW** | prioritization w/ user overrides |
| **Visual Query** (`visual/queries`, `desk/canvas/query`) | NL → structured retrieval → deterministic chart ops | **NEW** | LLM selects verified objects, never invents geometry |
| **Decision Compression** (`desk/canvas`) | what matters / watch next / what changes | **NEW** | three clear answers |

---

## 4. Owned records & contracts (field-level)

### `IntelligenceInsight` (NEW — VI-0; distinct from `AnalysisObject`)
```
IntelligenceInsight {
  id; sourceEngine; sourceVersion
  instrument; observedAt; availableAt; expiresAt?        # causal
  kind: "observation"|"interpretation"|"scenario"|"forecast"|"risk_warning"   # the 5 evidence types
  status: "proposed"|"active"|"confirmed"|"invalidated"|"expired"
  evidenceIds[]; objectIds[]; visualizationIds[]
  provenanceId
}
```
Note: an insight is **not** necessarily a chart object — e.g. "London swept Asia High" links to the Asia-High object + the sweep candle + the session interval.

### `ChartMapping` (NEW — VI-2; the visual instruction)
```
ChartMapping {
  mappingId; sourceModule
  objectIds[]; overlayType; geometryRefs[]
  focusTimeRange?: [number, number]
  visibility: "hidden" | "visible" | "focused"
  evidenceIds[]; scenarioId?
}
```
(Illustrative; production uses a validated discriminated union per `overlayType`.) The analysis system produces facts/hypotheses; the Chart Mapping Engine decides *how* to show them **without altering meaning**.

### `ViewManifest` (NEW)
```
ViewManifest { scope; sourceObjectIds[]; layers[]; priority; timeWindow; evidenceLinks[] }
```
Invariant: rendering a `ViewManifest` cannot modify any source analysis; it only selects/positions/styles.

---

## 5. Interfaces — produces / consumes

| Direction | Counterparty | Contract / purpose |
|---|---|---|
| consumes ← | every intelligence engine | `IntelligenceInsight` + geometry refs — engines **never draw directly** |
| consumes ← | [Market Intelligence](./MARKET_INTELLIGENCE.md) | `AnalysisObject`s + relations (shares the Evidence Relationship engine) |
| consumes ← | [Scenario Intelligence](./SCENARIO_INTELLIGENCE.md) | `ScenarioSpecification`/`ScenarioState` geometry → Scenario Studio |
| consumes ← | [Safety / Execution](./SAFETY_EXECUTION.md) | risk warnings/vetoes → P0 overlays that can never be hidden |
| produces → | [Experience Plane](./EXPERIENCE_PLANE.md) | `ViewManifest` per mode/surface; selection/focus/evidence interactions |
| produces → | [Experience Plane](./EXPERIENCE_PLANE.md) | the universal-investigation-context payload (select X → linked evidence) |

---

## 6. Guardrails & invariants
1. **Engines never draw directly.** Everything goes through the gateway → orchestrator → mapping; one place owns coherence. (Rule #7; the core D decision.)
2. **Never invent geometry.** A statement renders on the chart only if it resolves to real price/time geometry or verified object links; non-geometric statements (a macro forecast, a sample-size warning) go to timeline markers or context panels. (Rule #5.)
3. **Never draw before knowable.** The mapper respects `availableAt`/`viewAsOf`; nothing historical appears before its `known_at`, and scenarios never extend into the past.
4. **Critical warnings never hidden.** The clutter budget may collapse secondary objects, but P0 safety + scenario invalidations stay visible even under Simplify.
5. **Conflicts exposed, not averaged.** When engines disagree, the orchestrator shows the conflict; it never merges them into a misleading single score. Correlated observations (shared_origin) collapse to one primary + an evidence stack, preserving that correlated ≠ independent.
6. **The 5 types get distinct visual identities.** Observed fact · interpretation · conditional scenario · calibrated forecast · validated signal never look interchangeable.
7. **Presentation cannot mutate truth.** A `ViewManifest`/`ChartMapping` only selects/positions/styles; it cannot change an object, insight, or verdict.
8. **No new colours.** Reuse the existing `--role-*` theme tokens (the adapter already enforces this). `[VERIFIED adapter.ts:1-2]`

---

## 7. Phases that build it (from the Master Plan — the VI programme)

| Phase | Deliverable | Depends | Definition of Done | Test plan |
|---|---|---|---|---|
| **VI-0** | **Unified Intelligence Contracts**: `IntelligenceInsight`, geometry refs, provenance, timestamps, evidence relationships (FE+BE parity) | W0.4 | contracts published + parity | contract tests |
| **VI-2** | **Chart Mapping Engine**: normalize `desk/detect` + session intelligence into `ChartMapping` instructions | VI-0 | an insight → highlighted geometry + focus + evidence | mapping-correctness; "never draw before knowable" test |
| **VI-3** | **Visual Orchestrator**: dedup, prioritization, collision handling, contradictions, clutter budget | VI-2 | overlapping zones consolidate w/ evidence stack; warnings never hidden | dedup + clutter-budget + contradiction-not-averaged tests |
| **W3.4** | **Evidence Relationship & Contradiction Engine** (extends `relations.ts` shared_origin + confluence): independent/correlated/contradictory/unavailable/contextual | VI-0, [Market Intelligence](./MARKET_INTELLIGENCE.md) | correlated counted once; conflicts surfaced | dependency-dedup test |
| **VI-7** | **Cross-engine integration**: Regime/strategy/trade/macro/(future) Master Brain insights onto Canvas with distinct identities | VI-3 | each source renders distinctly; discretionary ≠ validated | per-source visual-identity test |
| **VI-8** | **Visual Query Assistant**: NL → structured evidence retrieval → deterministic chart ops | VI-7 | query focuses chart + opens evidence; LLM invents no geometry | query-determinism test |
| **(Attention/Compression)** | **Dynamic Attention + Decision Compression** (foundational usability) | VI-3 | attention prioritizes w/ user override; "what matters/next/changes" | attention-override + compression-correctness tests |

---

## 8. Context-specific acceptance tests
- **Overlay source traceability:** selecting any mapped item resolves its source engine + version, observations, and evidence.
- **Contradiction:** two disagreeing engines remain visibly disagreeing; no averaged score is produced.
- **Dedup without loss:** four engines on one zone render one primary zone + an expandable 4-source evidence stack; the four are not counted as four confirmations.
- **No invented geometry:** a statement without real geometry (macro/sample-size) renders as a marker/panel, never a fabricated line/zone.
- **Causality:** no object renders before `known_at`; replaying the clock rehydrates overlays under the same as-of.
- **Clutter budget:** past the density threshold, secondary objects collapse but P0 warnings + invalidations stay visible.
- **Type identity:** observed/interpretation/scenario/forecast/signal are visually distinguishable in a snapshot test.

---

## 9. Open decisions affecting this context
- **Decision 7 Visual design** — reuse theme tokens first vs a design-system overhaul. Recommended: **reuse `--role-*` tokens** (the adapter already does), overhaul later as a coordinated pass.
- **Overlay priority policy** — the exact P0–P3 budget thresholds and per-task presets (ties to [Experience Plane](./EXPERIENCE_PLANE.md) display policy).
- **Backend vs frontend split** — which parts of the orchestrator/graph run server-side (durable intelligence events, provenance, scenario state) vs client-side (selection/focus/visibility/rendering). Recommended: durable state + relations server-side; interaction/rendering client-side; reuse `AnalysisObject` + the annotation adapter.
- **Visual Query LLM scope** — confirm the LLM only *selects verified objects and calls deterministic chart ops* (no geometry authorship); this is a hard guardrail, but the retrieval surface needs design.

---

## 10. Code namespaces & tests to keep green
**Proposed namespaces:** `visual/{gateway,evidence-graph,attention,overlays,queries}` (backend/shared) + `frontend/src/desk/canvas/{chart-mapping,overlay-manager,rendering,interactions,presets,timeline,query}` (frontend).
**Existing to reuse/extend (do not discard):** `frontend/src/desk/layers/{adapter,layerStore,layerPresets,relevance,projection}.ts`, `desk/detect/relations.ts`, `desk/evidence/{EvidenceDrawer,describe}.ts`, `desk/confluence/*`, `desk/kernel/{viewAsOf,harness}.ts`.
**Tests that must stay green:** the DESK layer/evidence/relations/confluence suites (`layers.test.ts`, `g2.test.ts`, `evidence.test.tsx`, `confluence/*`, `detect/*`), `kernel/harness.test.ts`, plus `types/schemas.test.ts`. New canvas/orchestrator tests are additive.

---

## 11. Cross-context dependencies
- **Consumes from every engine** via the gateway; it is the single funnel between the intelligence engines and the chart.
- **Shares** the Evidence Relationship & Contradiction engine with [Market Intelligence](./MARKET_INTELLIGENCE.md) (classification there, visual consolidation here).
- **Renders** [Scenario Intelligence](./SCENARIO_INTELLIGENCE.md)'s branches (Scenario Studio) and [Safety / Execution](./SAFETY_EXECUTION.md)'s P0 warnings (never hideable).
- **Feeds** [Experience Plane](./EXPERIENCE_PLANE.md) the `ViewManifest`s that power Prepare/Live/Explore/Review and the universal investigation context.
- **Bound by** the causal spine from [Data Foundation](./DATA_FOUNDATION.md) + [Market Intelligence](./MARKET_INTELLIGENCE.md) (`availableAt`/`viewAsOf`); it presents causally or not at all.
- **The embodiment of the D decision:** engines publish, the orchestrator composes, the canvas shows — one honest picture, no direct drawing.
