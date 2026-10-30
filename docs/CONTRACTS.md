# Spekrym-FX — Canonical Contracts (schema source of truth)

**Status:** PROPOSED — the single reference the frontend (zod) and backend (pydantic) both derive from. **Date:** 2026-10-22.
**Scope:** every cross-context record. Rationale for each lives in its owning context doc under `docs/contexts/`; this file is the *schema*. Tags: **EXISTS / EXTEND / NEW** with `[VERIFIED path:line]` (2026-10-22 audit).

**How to use.** When a field here disagrees with code, this file is the target and the code is **EXTEND**. Changes are **additive and backward-compatible** (the `contractV2.test.ts` pattern proves new default-absent fields are safe). Never a breaking rename without a migration.

---

## 0. Conventions (apply to every contract)

- **Time.** UTC **seconds** internally (frontend converts in `lib/time.ts`); **ISO-UTC strings** on the wire (`2025-05-07 17:00:00+00:00`). `[VERIFIED docs/SCAN_CONTRACT.md]`
- **Causal 4-timestamp model** (Data Foundation, Rule #1): `eventTime` (happened) · `publishedAt` (source published) · `receivedAt` (we received) · `availableAt` (usable by a live system — the no-lookahead key). Market-facing records also carry `known_at` (became knowable) and `confirmed_at` (provisional→final). A *decision's* `decided_at` lives on the decision, never on the object.
- **Field names** are snake_case on the wire; only `Candle` is renamed (`t,o,h,l,c,v` → `time,open,high,low,close,volume`). Backend `null` for an unset field → absent key.
- **Identity.** Ids are content/semantic hashes where possible (e.g. a strategy *version* = ledger spec hash `[VERIFIED engine/ledger.py:23]`; an `AnalysisObject.id` excludes price so it is stable across regrades).
- **Versioning everywhere.** Every produced record carries the relevant version(s): `rules_version`, `model_version`, `cost_model_version`, `data_version`, `source_version`. Version changes never rewrite history (Rule #6).
- **Parity.** Each contract has a zod parser (FE) and a pydantic model (BE) that must agree; a frozen fixture captured from **real backend output** backs each (the `frontend/src/test/fixtures/*` pattern).

---

## 1. The five-type distinction (the master separation)

These are **separate types and separate screens** (Rule #4). Nothing is silently promoted up this ladder.

| Type | What it is | Owner context | Promotion requires |
|---|---|---|---|
| **AnalysisObject** | geometric/technical *evidence* (a level, zone, sweep…) | [Market Intelligence](./contexts/MARKET_INTELLIGENCE.md) | — (it is an observation) |
| **Insight** | an *interpretation* that links evidence | [Visual Intelligence](./contexts/VISUAL_INTELLIGENCE.md) gateway | links to real objects/events |
| **Scenario** | an explicitly *conditional* proposed future | [Scenario Intelligence](./contexts/SCENARIO_INTELLIGENCE.md) | triggers + invalidation + (for %) a validated model |
| **Signal** | defined + *validated* strategy logic | [Strategy / Trade / Portfolio](./contexts/STRATEGY_TRADE_PORTFOLIO.md) | a `validated`/`vault_confirmed` strategy version |
| **Order** | an *authorized operational* instruction | [Safety / Execution](./contexts/SAFETY_EXECUTION.md) | a `SafetyVeto`-clear `AuthorizationDecision` |

---

## 2. The eight cross-cutting canonical records

Minimal fields + the invariant each guarantees. (Full per-context detail in §3–§10.)

| Record | Min fields | Invariant | Owner |
|---|---|---|---|
| `AnalysisObject` | id; instrument; tf; geometry; t_event; known_at; lifecycle; source+rules_version | replay uses state knowable at as-of (prefix-equality) | Market Intelligence |
| `IntelligenceInsight` | id; sourceEngine; sourceVersion; kind; observedAt; availableAt; evidenceIds; objectRefs | separates observation/interpretation/scenario/forecast | Visual Intelligence |
| `ScenarioSpecification` | id; version; asOf; branches; conditions; invalidation; expiry; geometryRefs | frozen before outcome; prediction only with a valid model | Scenario Intelligence |
| `MarketEvent`/`FeatureRecord` | eventTime; publishedAt; receivedAt; availableAt; dataVersion; quality | point-in-time joins; no future leaks | Data Foundation |
| `RunManifest` | runId; strategyHash; datasetVersion+hash; model/feature/cost versions; seed; env; codeCommit | reproducible immutable results | Research OS |
| `TradeRecord`/`OpportunityRecord` | decisionId; opportunityId; eligibility; rejectedReason; tradeLegs; cost/version | no survival bias (log rejected + eligible) | Strategy/Trade/Portfolio |
| `ViewManifest` | scope; sourceObjectIds; layers; priority; timeWindow; evidenceLinks | rendering cannot modify source analysis | Visual Intelligence |
| `AuthorizationDecision` | actor; action; permission; source+version; timestamp; rationale | VAULT + live gates enforced server-side | Safety / Execution |

---

## 3. Data Foundation contracts
Owner: [DATA_FOUNDATION.md](./contexts/DATA_FOUNDATION.md).

### `MarketEvent` — **EXTEND** today's candle row (`candles` hypertable)
```
MarketEvent {
  instrument: str; tf: "M1"|"M5"|"M15"|"M30"|"H1"|"H4"|"D"|"W"
  eventTime: int                       # EXISTS as candles.ts
  publishedAt: int; receivedAt: int; availableAt: int     # NEW (no availability cols today)
  kind: "candle"|"calendar"|"quote"
  mid: {o,h,l,c,v}                      # EXISTS [candles o/h/l/c/v]
  bidask?: {bid_o,bid_h,bid_l,bid_c, ask_o,ask_h,ask_l,ask_c}   # EXISTS nullable [004_bidask.sql]
  complete: bool                        # EXISTS [fetch_ohlcv UPSERT]
  dataVersion: str                      # NEW
  quality: QualityScore                 # EXTEND (today: qa.py PASS/FAIL)
  provenance: {provider, request, ingestedBy}             # NEW
}
```

### `DatasetManifest` — **EVOLVE** `data/manifest.py`
```
DatasetManifest {
  datasetId; version; contentHash                         # NEW (pin + reproduce)
  instrument; tf; rows; start; end                        # EXISTS [manifest.json]
  qa: QualityScore                                        # EXTEND (today "PASS"/"FAIL")
  immutable: bool; createdAt; supersedes?: version        # NEW
  provenance: {provider, fetchWindow, migrationLevel}     # NEW
}
```

### `FeatureRecord` — **NEW** (feature store)
```
FeatureRecord { featureId; version; instrument; tf; eventTime; availableAt;
                value: number|object; inputsHash; dependsOn: featureId[] }
```

### `QualityScore` — **EXTEND** `data/qa.py`
```
QualityScore { status: "pass"|"degraded"|"quarantined"; score: 0..1;
               dups:int; monotonic:bool; max_gap_min:number; rows:int; reasons:[str] }
```

---

## 4. Market Intelligence contracts
Owner: [MARKET_INTELLIGENCE.md](./contexts/MARKET_INTELLIGENCE.md).

### `AnalysisObject` — **EXISTS** (`frontend/src/desk/types/schemas.ts`), promote to shared core
```
AnalysisObject {
  id; type; instrument; tf; source_tf                     # [VERIFIED schemas.ts]
  geometry: { bands: [{pLow, pHigh}], ... }               # [VERIFIED relations.ts envelope]
  t_event: int; known_at: int; confirmed_at: int|null     # [VERIFIED schemas.ts:77-79]
  lifecycle: LifecycleEvent[]                             # [VERIFIED schemas.ts:80]
  grade?: { significance: number|null, ... }              # SEPARATE from detection [schemas.ts:47-54,82]
  provenance: { detector, rulesVersion }                  # [VERIFIED schemas.ts:83]
}
```
Invariant: an object is never deleted for low significance; `id` excludes price (stable across regrades).

### `RegimeSnapshot` — **NEW** (unifies `structure.py` trend + `VolatilityAgent` + `atr_regime`)
```
RegimeSnapshot {
  id; instrument; t_event; available_at
  direction: {bullish_p, bearish_p, neutral_p}            # rule→one-hot until a model is calibrated
  trend_strength: number
  volatility_state: "dead"|"normal"|"expanding"|"extreme" # EXTEND VolatilityAgent [technical_tree.py:145]
  structure_state: "trend"|"range"|"compression"|"transition"   # EXTEND BOS/CHoCH [structure.py:40]
  momentum_state: "strengthening"|"stable"|"fading"
  transition_risk: number
  timeframe_alignment: "aligned"|"mixed"|"conflict"       # EXISTS mtf_aligned [context.py]
  data_quality: "valid"|"degraded"|"absent"
  model_version; rules_version
}
```
Invariant: **regime ≠ HTF directional bias ≠ execution conditions** — three fields, never one collapsed label. No numeric probability without a calibrated model.

### `ContextInsight` — **NEW** (macro/cross-asset context)
```
ContextInsight { id; sourceEngine; sourceVersion; instrument; availableAt;
                 kind; payload; sourceRights?; evidenceIds[] }
```

---

## 5. Scenario Intelligence contracts
Owner: [SCENARIO_INTELLIGENCE.md](./contexts/SCENARIO_INTELLIGENCE.md). All **NEW**.

### `ScenarioSpecification`
```
ScenarioSpecification {
  id; version; instrument; asOf: int
  kind: "conditional" | "forecast"                        # Category B vs C
  branches: [ { label, geometryRefs[], conditions[], invalidation, horizon, expiry } ]
  sourceEngine; sourceVersion
  evidenceIds[]; objectRefs[]                             # the Category-A facts it conditions on
  modelRef?                                               # required iff kind="forecast"
}
```
Invariant: frozen before outcome; a revision is a new version with visible history.

### `ScenarioState`
```
ScenarioState { scenarioId; version; asOf;
                status: "proposed"|"active"|"triggered"|"invalidated"|"expired";
                firedConditions[]; brokenInvalidations[]; observedAt; availableAt }
```

### `ForecastDistribution` (Category C only)
```
ForecastDistribution { instrument; asOf; horizon; modelRef; modelVersion;
                       distribution | interval;
                       calibration: {oosReliability, sharpness, sampleSize} }
```
Invariant: cannot exist without a `modelRef` to a validated, calibrated model.

---

## 6. Research OS contracts
Owner: [RESEARCH_OS.md](./contexts/RESEARCH_OS.md).

### Ledger records — **EXISTS/EXTEND** (`engine/ledger.py`, `engine/judge.py`)
```
register { kind:"register"; id: sha256(spec+gate)[:16]; ts; spec }         # EXISTS [ledger.py:23]
result   { kind:"result"; id; ts; experiment_count; verdict }              # EXISTS
Verdict  { status:"PASS"|"FAIL"|"INCONCLUSIVE"; passed;                    # EXISTS [judge.py:57]
           n_trades; expectancy_pips; win_rate; breakeven_win_rate;        # EXISTS [judge.py]
           beats_breakeven; fold_pos_frac; sharpe; p_value;                # EXISTS
           fdr_alpha; split:"train"|"valid"|"vault";                       # NEW (persist)
           evidence_tier; data_version; code_commit; cost_model_version }  # NEW
```

### `RunManifest` — **NEW** (Contract 2; wires unused `freeze_spec` `[ledger.py:26]`)
```
RunManifest { runId; strategyHash; specHash;
              datasetId; datasetVersion; datasetContentHash;
              modelRefs[]; featureVersions[]; costModelVersion; seed; environment; codeCommit;
              tradesRef; diagnosticsRef; validationReportId; hypothesisId; approvalHistory[];
              immutable: true }
```

### `ValidationReport` — **EXISTS** (serialize `judge_batch`)
```
ValidationReport { verdicts: Verdict[]; experiment_count; fdr_alpha; createdAt }   # immutable
```

### `evidence_tier` — **NEW** (derived label over existing facts)
```
evidence_tier ∈ { "exploratory", "in_sample", "validated", "vault_confirmed" }
  # exploratory = /api/scan or TRAIN-only un-judged [api/routes.py:98]
  # vault_confirmed = PASS via load_vault(final_confirmation=True), logged [partition.py]
```

### `StrategyVersion` / `HypothesisDraft` / `ExecutableSpec` — **NEW**
```
StrategyVersion { strategyId; version(=specHash); spec: StrategySpecification; highestTier }
StrategySpecification { id; version; universe{instruments,timeframe};
                        entry{direction,conditions[]}; exit{stop,target};
                        risk{risk_per_trade}; execution{model} }          # typed IR; also a Python-plugin form
HypothesisDraft { id; hypothesis; strategySpec; testPlan; proposedBy; asOf }   # from the Brain; proposal only
ExecutableSpec  { specHash; compiledRef; inspectionReport; sandboxed: true }
```

---

## 7. Strategy / Trade / Portfolio contracts
Owner: [STRATEGY_TRADE_PORTFOLIO.md](./contexts/STRATEGY_TRADE_PORTFOLIO.md).

### `TradeRecord` — **EXTEND** `backtest/scalp_engine.py ScalpTrade`
```
TradeRecord {
  trade_id; strategy_id; strategy_version
  category: "executed"|"rejected"|"eligible"|"counterfactual"     # the 4 categories (no survival bias)
  instrument; direction; entry_time; exit_time                    # EXISTS entry_ts/exit_ts
  entry_price; exit_price; stop; target                           # EXISTS entry/exit
  entry_reason_codes[]                                            # EXTEND (today free-text `reason`)
  regime_snapshot_id                                              # NEW (FK → RegimeSnapshot, known at entry)
  gross_pnl; net_pnl; R; mfe_R; mae_R                             # EXISTS net_pips/pnl_usd/R; mfe/mae NEW
  spread_cost; slippage; commission                              # EXISTS spread_at_entry; slippage/commission NEW
  exit_reason; hold_min; session                                 # EXISTS [scalp_engine.py:38-44]
  decision_trace: DecisionStep[]                                 # NEW
  data_version; code_commit; cost_model_version                  # NEW (lineage)
}
```

### `OpportunityRecord` / `EligibilityDecision` / `DecisionTrace` / `PortfolioExposure` — **NEW**
```
OpportunityRecord { opportunity_id; definitionId; instrument; asOf; taken: bool; reason; regime_snapshot_id }
EligibilityDecision { strategy_id; strategy_version; evidence_tier;      # validated/vault_confirmed for live
                      instrument; asOf; eligible: bool; reasons[];
                      regime_snapshot_id; gatesFired[] }                 # reuse coordinator veto gates
DecisionStep { at; step: "allowed"|"rejected"|"modified"|"exited"; rule; evidenceIds[] }
PortfolioExposure { asOf; strategies[]; openPositions[];
                    currencyExposure: {USD,EUR,...};                      # currency-level, overlapping base/quote
                    portfolioDrawdown; tailRisk; correlationState;
                    marginalRiskContribution: {strategyId→number}; constraints[]; vetoes[] }
```

---

## 8. Safety / Execution contracts
Owner: [SAFETY_EXECUTION.md](./contexts/SAFETY_EXECUTION.md).

### `CostModel` / `FillModel` — **EXTEND** (unify the three; D1)
```
CostModel { cost_model_version; basis: "bid_ask"|"modeled_spread";       # recommend bid_ask (scalp_engine)
            spread_source: "data_bidask"|"flat_pips";
            slippage_pips; commission_per_trade; swaps?;                  # commission only in engine.py today (0)
            fill_rule: "sl_before_tp_intrabar"; fidelityLevel: 1|2|3|4;   # [scalp_engine.py:129-138]
            assumptionsLabel }                                           # stated when depth/tick absent
```

### `SafetyLimits` / `SafetyVeto` / `OrderState` — **NEW** (none exist today — grep-clean)
```
SafetyLimits { killSwitch: bool; dailyLossLimit; maxDrawdownPct; exposureCap;
               perTradeRiskPct; sessionExposureCap }
SafetyVeto   { at; scope: "trade"|"strategy"|"portfolio"|"global"; limit; observed; reason; actor:"safety" }
OrderState   { orderId; strategy_id; strategy_version; instrument; intended; filled?;
               status: "queued"|"submitted"|"partial"|"filled"|"rejected"|"cancelled";
               slippageObserved; reconciliationRef }                     # DEFER (W8.3)
```
Invariant: a `SafetyVeto`/kill switch overrides any `EligibilityDecision`; enforced server-side.

### `AuthorizationDecision` — **NEW** (the server-side live/VAULT gate)
```
AuthorizationDecision { actor; action; permission; source; sourceVersion; timestamp; rationale }
```

---

## 9. Visual Intelligence contracts
Owner: [VISUAL_INTELLIGENCE.md](./contexts/VISUAL_INTELLIGENCE.md). All **NEW** (foundations exist: `adapter.ts`, `relations.ts`, `EvidenceDrawer`).

### `IntelligenceInsight` (VI-0; distinct from `AnalysisObject`)
```
IntelligenceInsight {
  id; sourceEngine; sourceVersion; instrument
  observedAt; availableAt; expiresAt?
  kind: "observation"|"interpretation"|"scenario"|"forecast"|"risk_warning"
  status: "proposed"|"active"|"confirmed"|"invalidated"|"expired"
  evidenceIds[]; objectIds[]; visualizationIds[]; provenanceId
}
```
Note: an insight is not necessarily a chart object (e.g. "London swept Asia High" links Asia-High + sweep candle + session interval).

### `ChartMapping` (VI-2) / `ViewManifest` / `ViewQuery`
```
ChartMapping { mappingId; sourceModule; objectIds[]; overlayType; geometryRefs[];
               focusTimeRange?: [int,int]; visibility: "hidden"|"visible"|"focused";
               evidenceIds[]; scenarioId? }                              # discriminated union per overlayType in prod
ViewManifest { scope; sourceObjectIds[]; layers[]; priority; timeWindow; evidenceLinks[] }
ViewQuery    { text?; filters?; asOf; focusTarget? }                     # NL → deterministic chart ops; LLM invents no geometry
```
Invariant: presentation cannot mutate source analysis; engines never draw directly.

---

## 10. Experience Plane contracts
Owner: [EXPERIENCE_PLANE.md](./contexts/EXPERIENCE_PLANE.md).

### `ShareState` — **EXTEND** (`frontend/src/url/urlState.ts`)
```
ShareState {
  pair?; tz?; linked?; layout?; mode?                     # EXISTS [urlState.ts:9-14]
  app?: "desk"; deskArea?: "my"|"analysis"; wf?: "prepare"|"live"|"review"   # EXISTS [:16-18]
  strategy?; from?; to?; params?                          # EXISTS [:19-22]
  trade?; experiment?; regimeAt?; canvasMode?             # NEW (deep links)
}
```
Invariant: additive + validated; malformed params dropped, never thrown; `?window=` role preserved across rewrites.

### `Job` — **NEW** (async lifecycle)
```
Job { id; kind: "scan"|"run"|"batch"|"regime"|"validate";
      status: "queued"|"running"|"done"|"error";
      created_at; started_at?; finished_at?; progress?; result_ref?; error?: {detail}; experiment_id? }
```

---

## 11. Existing contracts to PRESERVE (don't break)

### Scan HTTP contract — **EXISTS** (`docs/SCAN_CONTRACT.md`, `api/schemas.py`, `frontend/src/types/schemas.ts`)
```
Candle   { time,open,high,low,close,volume }              # t,o,h,l,c,v renamed; UTC seconds
StrategyDef { id,name,description,supported_timeframes,context_timeframes,display_tz,params[] }
ParamDef by type: number/integer{default,min?,max?,step?} | boolean{default}
          | select{default,options[]} | time{default HH:MM}; all carry key,label,unit?,help?
ScanRequest { strategy_id,pair,timeframe,from,to,params }
ScanResult  { scan_id,timeframe,strategy,params_used,setups[],summary,warnings[] }
Setup   { id,status:"valid"|"rejected",direction?,date,focus{from,to},steps[],conditions[],annotations[],outcome? }
Outcome { result:"win"|"loss"|"flat", r_multiple, net_pips, cost_pips, exit_reason, bars_held }  # [schemas.ts:269-273]
Summary { n_valid,n_rejected,n_wins,n_losses,win_rate,expectancy_r,avg_win_r,avg_loss_r,cost_pips_assumed }  # [schemas.ts:310-319]
```
Endpoints: `GET /api/strategies|bounds|candles`, `POST /api/scan`; errors `{"detail":"..."}`. New `/api/v1/*` endpoints are additive; these stay as-is. `TradeRecord` is a *superset* of `Setup.outcome` (the outcome is its projection).

### DeskSource envelope — **EXISTS** (`frontend/src/desk/source/deskSource.ts`)
```
Sourced<T> { data: T; provenance: SourcedProvenance }     # kind: "sample"|"live"; staleness/availability
DeskSource { capabilities; getCandles; getEvents; getSessions; getPositioning; /* NEW: getEngineObjects */ }
```

### Engine gate config — **EXISTS, reuse unchanged** (`engine/judge.py`)
```
GateConfig { stop_pips; target_pips; cost_pips=1.6; min_trades=30; min_fold_pos=0.75;
             fdr_alpha=0.05; boot_iters=2000 }            # [VERIFIED judge.py:23-30]
```

---

## 12. Evolution & validation rules
- **Additive only.** New fields are optional/default-absent; `contractV2.test.ts` is the precedent that catalog schemas extend safely. A breaking change needs a `/api/v1` bump + migration, never an in-place rename.
- **Every record is versioned and causal.** If a record can appear on a chart or in a report, it carries `availableAt`/`known_at` and the relevant `*_version`.
- **Parity gate.** For each contract: a zod parser (FE) + a pydantic model (BE) + a frozen fixture from real backend output + a `*.test` asserting they agree. No endpoint/record ships without its fixture.
- **One definition.** A shared concept (AnalysisObject, cost model, a feature) has exactly one authoritative schema here; backend and frontend implementations are parity-tested, never silently forked.
- **Owner of record.** Each contract has exactly one owning context (§ headers); other contexts reference it, never redefine it.
```
Reading map:  INTEGRATION_DESIGN.md → MASTER_DEVELOPMENT_PLAN.md → contexts/ → DECISIONS.md → CONTRACTS.md (this file)
```
