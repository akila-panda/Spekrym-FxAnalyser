# Context Deep-Dive — Research Operating System (Bounded Context #4)

Part of `docs/MASTER_DEVELOPMENT_PLAN.md` (Part II §5, context #4). Companion to the sibling context docs. Tags: **EXISTS / EXTEND / NEW / CONDITIONAL / DEFER**; evidence `[VERIFIED path:line]` (read 2026-10-22), `[DOC]`, `[PROPOSED]`.

> **One-line role:** the incorruptible core — pre-register hypotheses, run them reproducibly, let the **independent Judge** decide PASS/FAIL/INCONCLUSIVE, protect the holdout, and keep an immutable, tamper-evident record of everything tried. This is the most mature context: mostly **reuse + extend**, never fork.

---

## 1. Mission & boundary

**Owns.** The hypothesis/experiment registry; research knowledge links; the strategy compiler + static analysis; the workflow DAG + async jobs; the experiment artifact store; robustness evaluation; the **Judge** (fixed statistical gates); the **VAULT** (locked holdout); and the **model registry** (regime/forecast/anomaly models, distinct from strategies).

**Produces.** `ExperimentResult`, `ValidationReport`, `RegistryDecision`, `RunManifest` — plus the append-only ledger. Verdicts are immutable and separate from proposals.

**Explicitly does NOT own:**
- *Authoring* hypotheses / drafting strategy code — the Master Brain *proposes* (owned by [Strategy / Trade / Portfolio](./STRATEGY_TRADE_PORTFOLIO.md) authoring + the Brain in Wave 6); Research OS *registers, runs, and judges* them.
- *Live* selection, portfolio, or execution — that is [Strategy / Trade / Portfolio](./STRATEGY_TRADE_PORTFOLIO.md) + [Safety / Execution](./SAFETY_EXECUTION.md). A PASS is research evidence, not live authorization.
- The *data* — it consumes version-pinned datasets from [Data Foundation](./DATA_FOUNDATION.md).
- *Presentation* of results — the Research Workbench UI lives in [Experience Plane](./EXPERIENCE_PLANE.md).

Boundary rule: *Research OS answers "is there reproducible, cost-surviving, multiple-testing-corrected evidence?" — and it alone answers it. Nothing can argue with the Judge.*

---

## 2. Current state (audited)

The research spine is **production-grade and should be reused unchanged** at its core; the gaps are the scaffolding around it (registry/manifest/workflow/tiers/model-registry).

| Capability | Status | Evidence |
|---|---|---|
| **Judge** — fixed gates: cost_pips=1.6, min_trades=30, min_fold_pos=0.75, fdr_alpha=0.05, boot_iters=2000 | **EXISTS** | `[VERIFIED engine/judge.py:23-30]` (`GateConfig`) |
| Verdict logic: PASS = significant ∧ fold_ok ∧ expectancy>0 ∧ enough_trades; FAIL = evidence of no edge; INCONCLUSIVE = too few/noisy | **EXISTS** | `[VERIFIED engine/judge.py:139-149]` (`_status`); `beats_breakeven` is diagnostic only `[:39]` |
| Bootstrap p + **Benjamini-Hochberg FDR across the batch** | **EXISTS** | `[VERIFIED engine/judge.py:93, 123-128]` (`_boot_p`, `_bh_significant`) |
| **VAULT** holdout: TRAIN .6 / VALID .2 / VAULT .2; locked unless `final_confirmation=True`; every read counted+logged | **EXISTS** | `[VERIFIED engine/partition.py:20, 33-39]`; `_VAULT_LOG` `:21`; **0 consultations** (file absent) |
| **Append-only, tamper-evident ledger**: sha256 pre-registration; post-hoc gate edit rejected | **EXISTS** | `[VERIFIED engine/ledger.py:23, 43-44]`; rejection `[ledger.py:72-77 per audit]` |
| Walk-forward runner (`run(Hypothesis, df)`, 4-fold chronological consistency) | **EXISTS** | `[VERIFIED engine/runner.py:58-70 per audit]` |
| True expanding walk-forward (standalone research script, not wired to the registry) | **EXISTS (partial)** | `[DOC research/walkforward_eurusd.py]` |
| Pickle cache + exact cache-vs-DB proof | **EXISTS** | `engine/datacache.py` `verify_equiv` |
| Adversarial + golden test suite (no-future-leak, bid/ask-not-mid, slippage-bites, frozen-spec-binds, hand-computed P&L) | **EXISTS** | `engine/tests/{test_adversarial,test_golden,test_partition,test_ledger,test_judge,test_runner,test_end_to_end,test_datacache}.py` |
| **Lineage binding `freeze_spec(code_commit, data_snapshot, cost_model_version)`** | **EXISTS-BUT-UNUSED** | `[VERIFIED engine/ledger.py:26]` — defined; **no production caller** (only a test) |
| **Named evidence-tier ladder** (exploratory/in_sample/validated/vault_confirmed) | **MISSING** | only PASS/FAIL/INCONCLUSIVE + TRAIN/VALID/VAULT exist |
| **Strategy registry / version library + promotion history** | **MISSING** | a version ≈ a ledger spec hash, but no catalog/promotion view |
| **Run Manifest + artifact store** (reproducible bundle) | **MISSING** | `freeze_spec` has the slots; nothing assembles/stores a bundle |
| **Strategy compiler + static analysis** | **MISSING** | strategies are hand-written Python `strategy_fn`s |
| **Workflow DAG + async jobs** (experiments as graphs, retries, checkpoint) | **MISSING** | runs are synchronous, single-step |
| **Research knowledge graph** (strategy↔hypothesis↔failure↔experiment↔dataset↔model) | **MISSING** | — |
| **Model registry** (regime/forecast models, versions, calibration, drift) | **MISSING** | `forecast/models/*` exist as files, no governed registry |
| **Robustness laboratory** (perturbation sweeps → robustness profile) | **MISSING** | ad-hoc in research scripts |
| Extra statistical governance: research-family/dependent-hypothesis, validation-reuse/adaptive-selection, min economic effect size | **MISSING** | FDR + min_trades exist; the rest don't |

**Honest anchors specific to this context:** the Judge already *works* — it marked the two best TRAIN leads INCONCLUSIVE and they then failed OOS; the VAULT has never been opened. The research it governs concluded **no durable intraday EUR/USD edge**. So the extensions below exist to *scale honest rejection across many strategies*, not to make a dead edge pass.

---

## 3. Internal components / modules

| Component | Responsibility | Today | Target |
|---|---|---|---|
| **Judge** (`engine/judge.py`) | Fixed gates → PASS/FAIL/INCONCLUSIVE; FDR across batch | EXISTS (reuse unchanged) | add governance *around* it (families, reuse), not inside |
| **Partition/VAULT** (`engine/partition.py`) | Chronological split; locked holdout; logged reads | EXISTS (reuse unchanged) | wire the frozen-spec vault runner (the one missing caller) |
| **Ledger** (`engine/ledger.py`) | Append-only pre-registration + results; tamper-evident | EXISTS | EXTEND verdict record fields; evidence tier; promotion history |
| **Runner** (`engine/runner.py`) | Walk-forward execution over `scalp_engine` | EXISTS | EXTEND: expanding WF option; emit to artifact store |
| **Strategy compiler** (`research/compiler`) | Compile a `StrategySpecification` → validated executable; static checks | **NEW** | reject future-data/unbounded-lookback; sandbox generated Python |
| **Workflow orchestrator** (`research/workflows`) | Experiments as DAGs; retries/checkpoint/quotas/approval; async jobs | **NEW** | survive restart; idempotent; immutable results |
| **Artifact store / Run Manifest** (`research/artifacts`) | Immutable reproducible bundle per run | **NEW** (wires `freeze_spec`) | content-addressed |
| **Knowledge graph** (`research/hypotheses` + links) | Relate strategies/hypotheses/failures/experiments/datasets/models | **NEW** | relational first |
| **Model registry** (`research/models`) | Govern regime/forecast/anomaly models | **NEW** | versions, calibration, drift, deployment |
| **Robustness lab** | Perturbation sweeps → robustness profile per version | **NEW** | spread/slippage/delay/param/period |

---

## 4. Owned records & contracts (field-level)

### `ExperimentRecord` / `ExperimentResult` (EXTEND `engine/ledger.py`)
```
register:  { kind:"register", id: sha256(spec+gate)[:16], ts, spec }     # EXISTS [ledger.py:23]
result:    { kind:"result", id, ts, experiment_count, verdict }          # EXISTS
verdict (EXTEND): { status: PASS|FAIL|INCONCLUSIVE, passed,              # EXISTS [judge.py:57]
                    n, expectancy_pips, win_rate, p_value, fold_pos_frac, # EXISTS
                    fdr_alpha, split: train|valid|vault,                 # NEW (persist)
                    evidence_tier, data_version, code_commit,            # NEW
                    cost_model_version }                                  # NEW
```

### `RunManifest` (NEW — Contract 2; wires the unused `freeze_spec`)
```
RunManifest {
  runId; strategyHash; specHash                      # ties to the registration id
  datasetId + version + contentHash                  # from Data Foundation
  modelRefs[]; featureVersions[]                      # from Market Intelligence / model registry
  costModelVersion; seed; environment                # reproducibility
  codeCommit                                         # freeze_spec slot [ledger.py:26]
  trades/decisions/diagnostics refs; validationReportId
  hypothesisId; approvalHistory[]
  immutable: true
}
```

### `ValidationReport` (EXISTS — serialize `judge_batch`)
`[Verdict]` + batch context (experiment_count, fdr_alpha). Immutable; separate from any proposal.

### `RegistryDecision` / evidence tier (NEW — derived label over existing facts)
```
evidence_tier ∈ { exploratory, in_sample, validated, vault_confirmed }
  exploratory    : /api/scan output or TRAIN-only, un-judged ("not validated by the Judge" [api/routes.py:98])
  in_sample      : judged on TRAIN, any status
  validated      : PASS on VALID after FDR, VAULT untouched
  vault_confirmed: PASS via load_vault(final_confirmation=True) — backend-only, logged
```
`StrategyVersion` = the ledger registration id (spec hash). Promotion history = the derived sequence of versions → highest tier reached.

### `HypothesisDraft` / `ExecutableSpec`
`HypothesisDraft` (from the Brain) = a falsifiable hypothesis + a `StrategySpecification` + a test plan. `ExecutableSpec` = the compiler's validated, sandboxed output + an inspection report.

---

## 5. Interfaces — produces / consumes

| Direction | Counterparty | Contract / purpose |
|---|---|---|
| consumes ← | [Data Foundation](./DATA_FOUNDATION.md) | version-pinned `DatasetManifest`; causal frames |
| consumes ← | [Strategy / Trade / Portfolio](./STRATEGY_TRADE_PORTFOLIO.md) / Master Brain | `HypothesisDraft` + `StrategySpecification` (proposals only) |
| consumes ← | [Market Intelligence](./MARKET_INTELLIGENCE.md) | regime/features as experiment inputs (feature store) |
| produces → | [Strategy / Trade / Portfolio](./STRATEGY_TRADE_PORTFOLIO.md) | `ValidationReport`, `RegistryDecision`, evidence tier → selector eligibility |
| produces → | [Scenario Intelligence](./SCENARIO_INTELLIGENCE.md) | a *validated* model ref (unlocks Category-C forecasts) |
| produces → | [Experience Plane](./EXPERIENCE_PLANE.md) | ledger/experiments/verdicts for the Research Workbench + analytics ledger board |
| produces → | all (event bus) | `experiment.registered`, `backtest.completed`, `validation.completed`, `strategy.approved` (facts) |
| executes on | [Safety / Execution](./SAFETY_EXECUTION.md) cost model | `scalp_engine` fills + the canonical `cost_model_version` |

---

## 6. Guardrails & invariants
1. **The Judge is the sole verdict authority.** LLMs/heuristics propose; only the Judge emits PASS/FAIL/INCONCLUSIVE. "The strategy's author cannot argue with it." `[VERIFIED engine/judge.py docstring]` (Rule #2.)
2. **VAULT is backend-enforced, server-side.** Readable only via `load_vault(..., final_confirmation=True)`, every read counted+logged; no API, LLM, workflow, or UI path may reach it otherwise. `[VERIFIED engine/partition.py:33-39]` (Rule: holdout governance.)
3. **Append-only + tamper-evident.** New endpoints go through `register`/`record_result`; a post-hoc gate edit is detected by re-hash and rejected. `[VERIFIED engine/ledger.py:6-9, 23]`
4. **Multiple-testing is corrected and shown.** Every verdict carries `experiment_count` + FDR status; the UI shows "tested N variants". `[VERIFIED engine/judge.py:123-128]`
5. **`vault_confirmed` ≠ guarantee.** It is the strongest tier, not proof of durable profitability; expectancy net of cost, never win rate, is the target.
6. **Reproducible + immutable.** Every run emits a `RunManifest`; the same manifest reproduces the result within a declared tolerance; artifacts are content-addressed and never mutated.
7. **Sandboxed authoring.** LLM/compiler-generated strategy code runs in isolated workers with allowlists + resource limits and can **never** modify the Judge, unlock the VAULT, or touch credentials.
8. **Reuse, don't fork.** No second Judge/ledger/partition. Extensions wrap the core; golden + adversarial tests must stay green through every change.

---

## 7. Phases that build it (from the Master Plan)

| Phase | Deliverable | Depends | Definition of Done | Test plan |
|---|---|---|---|---|
| **W1.1** | **Strategy Specification + registry/version library** (Contract 1): typed spec + Python-plugin interface; version = spec hash; structural diff + duplicate detection | W0.4 | a strategy authored as spec compiles + registers; variant → new version | spec-compiles + duplicate-detection tests; `engine/tests` green |
| **W1.2** | **Strategy Compiler + Static Analysis**: reject invalid/contradictory/future-data/unbounded-lookback; sandbox generated Python | W1.1 | invalid specs rejected pre-backtest with an inspection report | static-check unit tests; sandbox-escape test |
| **W1.3** | **Run Manifest + Artifact Store** (Contract 2): wire `freeze_spec`; immutable bundle per run | W0.3, W1.1 | every run → a reproducible manifest | same-manifest-reproduces test within tolerance |
| **W1.4** | **Evidence tiers + verdict-record extension + promotion history** | W1.3 | tiers derived; promotion history listable | tier-transition tests on a fixture ledger; `test_ledger.py` green |
| **W1.5** | **Research Workflow Orchestrator (DAG) + async HTTP job API**; move batch/vault runs to jobs | W1.3 | multi-step experiment runs as a DAG; `POST /jobs`→202; vault job refused without `final_confirmation` | job-lifecycle + restart-recovery + vault-guard tests |
| **W1.6** | **Research Knowledge Graph** (relational first) | W1.4 | relationships queryable ("which families failed?") | relationship-integrity tests |
| **W6.1–6.3** | **Master Brain authoring hooks** (propose → compile → register; persistent research memory) — LLM proposes only | W1.5, W1.6 | a proposal becomes a registered experiment; no auto-promote | "cannot write a verdict / cannot reach load_vault" test |
| **W9.2** | **Robustness Laboratory** (perturbation sweeps → robustness profile per version) | W1.3 | each version gets a robustness profile | robustness-profile tests |
| **W9.4** | **Model Registry** (regime/forecast/anomaly; versions, calibration, drift) | W3.2 | models versioned + drift-tracked; unlocks Scenario Category-C | model-version/drift tests |
| **W9.5** | **Distributed Research Compute + experiment dedup** (quotas, caching, early termination, budgets) | W1.5 | equivalent experiments deduped before running; budgets enforced | dedup + budget tests |
| **(EXTEND)** | Statistical governance: family/dependent-hypothesis + validation-reuse/adaptive-selection controls + min economic effect size | W1.4 | dependent hypotheses grouped; reuse tracked | governance-unit tests |

---

## 8. Context-specific acceptance tests
- **Judge integrity (reuse):** 100 null hypotheses yield ≤ the expected false-positive rate after FDR; a genuine edge still PASSes. `[engine/tests/test_judge.py]`
- **VAULT lock:** normal experiment code cannot read VAULT rows; a vault job without `final_confirmation` is refused (API 409) and the consultation counter is visible. `[engine/tests/test_partition.py]`
- **Tamper evidence:** a post-hoc gate edit is detected and rejected. `[engine/tests/test_ledger.py]`
- **Reproducibility:** the same `RunManifest` reproduces the experiment within tolerance across environments.
- **Frozen-spec binding:** a run's id changes if code commit, data snapshot, or cost-model version changes. `[engine/tests/test_adversarial.py]`
- **Tier correctness:** a TRAIN-only PASS is `in_sample`; a VALID PASS after FDR is `validated`; only a logged `load_vault` run is `vault_confirmed`.
- **Sandbox:** generated strategy code cannot import/modify the Judge, read the VAULT, or access credentials.

---

## 9. Open decisions affecting this context
- **Decision 9 Research controls** — approval-workflow shape, Judge-settings ownership, VAULT-access role ownership. Recommended: **human-only VAULT authorization**, Judge config change-controlled + logged.
- **OQ-1 Cost model** — the runner executes on one canonical cost model; `cost_model_version` must be recorded in every `RunManifest`. Recommended: `scalp_engine` real bid/ask as the baseline.
- **Strategy representation** — formal spec vs arbitrary Python plugins. Recommended: **both behind one validated interface** (W1.1/W1.2).
- **Execution environments (Decision 5)** — local Mac + deployable workers → the DAG/compute design must produce deterministic, content-addressed artifacts that reproduce across environments.
- **Adaptive-selection policy** — how aggressively to penalise validation-data reuse / family size (beyond BH-FDR). Needs a documented rule before autonomous proposing (Wave 6).

---

## 10. Code namespaces & tests to keep green
**Proposed namespaces:** `research/{hypotheses,compiler,workflows,artifacts,judge-adapter,models}` — wrapping, never replacing, `engine/`.
**Existing to reuse (unchanged core):** `engine/{judge,partition,ledger,runner,datacache}.py`, `engine/ledger.jsonl`, `backtest/scalp_engine.py`, `research/walkforward_eurusd.py`.
**Tests that must stay green:** `engine/tests/{test_judge,test_partition,test_ledger,test_runner,test_adversarial,test_golden,test_end_to_end,test_datacache}.py` (datacache needs the DB), plus `backtest/tests/*`. Any extension is additive; the golden/adversarial numbers must still reproduce exactly.

---

## 11. Cross-context dependencies
- **Reads** version-pinned datasets from [Data Foundation](./DATA_FOUNDATION.md) (feeds `RunManifest`) and regime/features from [Market Intelligence](./MARKET_INTELLIGENCE.md).
- **Executes** on [Safety / Execution](./SAFETY_EXECUTION.md)'s canonical cost model (`scalp_engine` + `cost_model_version`).
- **Gates** [Strategy / Trade / Portfolio](./STRATEGY_TRADE_PORTFOLIO.md): only a `validated`/`vault_confirmed` strategy version is eligible for the live selector; the registry/version library (Contract 1) is co-owned (authored there, governed here).
- **Unlocks** [Scenario Intelligence](./SCENARIO_INTELLIGENCE.md) Category-C by validating + calibrating a model in the model registry.
- **Surfaced by** [Experience Plane](./EXPERIENCE_PLANE.md): the Research Workbench + the analytics ledger board read experiments/verdicts/tiers; they display, never decide.
- **Receives** proposals from the Master Brain (Wave 6) — which can propose and draft but never self-certify or reach the VAULT.
