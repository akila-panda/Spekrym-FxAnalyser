# Forex Trading Intelligence System — Integration Design

**Status:** design review (no code written). **Date:** 2026-10-22.
**Author role:** principal-engineer integration design for `Spekrym-FxAnalyser`.
**Input plan:** `forex_trading_intelligence_system_plan.docx` ("Forex Trading Intelligence System — Research, Market Regimes, Trade Intelligence & Master Brain").

**Evidence tags used throughout:**
`[VERIFIED path:line]` read in code · `[DOC]` stated in a doc, not confirmed in code · `[PROPOSED]` new in this design · `[UNKNOWN]` could not determine → goes to the questions list.

---

## 1. Executive summary

**Scope clarification (2026-10-22, from the user).** This is **not** an OBE/ORB project. OBE is one example strategy; the goal is a **strategy-agnostic research factory** where many strategies are authored, backtested, analysed, regime-conditioned, and validated. The new systems (Trade Intelligence, Regime, Master Brain, Validation) exist to **help that process for any strategy**, not to prop up one. This design reads accordingly: every contract below is keyed by `strategy_id`/`strategy_version`, never by ORB. Two consequences: (a) the repo's spine is *already* strategy-agnostic (`runner.run` takes any `strategy_fn` `[VERIFIED engine/runner.py:24-30]`), so little changes; (b) the honest risk shifts from "betting on a dead strategy" to **manufacturing false positives by testing many strategies** — which makes the ledger's `experiment_count` + Benjamini-Hochberg FDR the centerpiece, not a footnote. `[VERIFIED engine/judge.py:70-84; engine/ledger.py:56-66]`

**What exists.** This repo is *not* greenfield. It already contains a production-grade research spine that implements most of the plan's "Validation & Strategy Management" and "Trading Engine" pillars:

- **The Judge** — fixed statistical acceptance gates: expectancy-net-of-cost, bootstrap significance, Benjamini-Hochberg FDR across the experiment batch, fold-consistency, `min_trades=30`. `[VERIFIED engine/judge.py:22-39, :139-149]`
- **Locked holdout (VAULT)** — chronological TRAIN 60 / VALID 20 / VAULT 20 split; the vault refuses reads unless `final_confirmation=True`, every read is counted and logged; **0 consultations to date** (`engine/vault_access.json` does not exist). `[VERIFIED engine/partition.py:20, :37-39, :55-70, :73-76]`
- **Append-only experiment ledger** — SHA-256 pre-registration binds the gate; post-hoc gate edits are rejected. `[VERIFIED engine/ledger.py:21-23, :59-66, :72-77]`
- **Realistic execution** — bid/ask fills with the spread baked into P&L, session/spread/time gates, per-trade `ScalpTrade` records. `[VERIFIED backtest/scalp_engine.py:1-7, :31-45]`
- **A deterministic "brain"** — `StrategyCoordinator` already aggregates three agent trees with risk-first hard-veto gates and a confidence score, and writes an append-only decision log. `[VERIFIED agents/coordinator.py:85, :102, :131-142; agents/audit.py]`
- **A frontend cockpit** — three apps (Scan, Desk, Relay) with a typed `DataSource`/`DeskSource` seam, a mock/HTTP factory, zod contract validation, frozen backend fixtures, and multi-window state-replication discipline. `[VERIFIED frontend/src/api/dataSource.ts:17, frontend/src/desk/source/deskSource.ts:58, frontend/src/api/sourceFactory.ts:11]`

**What is genuinely new.** Three things in the plan do **not** exist and are the real build: (1) a **structured per-trade Intelligence ledger** with regime snapshot + decision trace + data lineage; (2) a **Market Regime Engine** that emits a timestamped, causal, multi-dimensional state vector (today's regime logic is rule-based trend/CHoCH + an ATR band, no statistical model); (3) an **LLM Master-Brain orchestration layer** over the existing deterministic coordinator and Judge. A fourth, **async job + HTTP exposure** of long-running runs, is also missing.

**The five biggest risks.**

1. **Multiple-testing across many strategies is now the primary risk** (given the strategy-factory scope). Every strategy/variant tried must be counted in the ledger and FDR-corrected, or the factory manufactures false positives at scale — the exact failure mode the Judge exists to prevent. Prior single-pair price families already demonstrate this: ORB/fade/momentum/Asian-range all FAILed, and the one mildly-positive candidate (+4.94%/85 trades) was **not significant**. The lesson for a factory: most strategies will not clear, and that must be visible, not buried. `[VERIFIED engine/judge.py:70-84]` `[DOC NO_INTRADAY_EDGE.md:9; BACKTEST_INTEGRITY_AUDIT.md:41-43]`
2. **No strategy is a trustworthy "baseline" by default — including OBE.** OBE specifically is **32.17% win, −16.4% return, "No edge"**, and the plan's "43% win rate" has **no source** here (`0.43` is forecast model *accuracy*; "43%" is also a label-misalignment stat). This matters for the factory only as a discipline: a new strategy earns its tier through the gates, never through a quoted number. `[VERIFIED backtest/results/sample_eurusd_h1.json; forecast/results/walkforward_EUR_USD_H1_h1.json:43]` `[DOC SYSTEM_STRATEGY_AND_EDGE.md:92-94]`
3. **Sample size vs regime slicing.** The only real executed-trade sets are **85** (forecast) and **180** (scalp); the Judge requires **≥30 trades per cell**. Conditioning on regime (direction × vol × session) produces cells far below the gate → mostly `INCONCLUSIVE`. `[VERIFIED engine/judge.py:101; TRADE_ANALYSIS.csv=85; SCALP_TRADES.csv=180]`
4. **Three incompatible cost models.** `backtest/engine.py` (0.6/0.1 pip modeled, or **0.0** in the OBE run), `backtest/scalp_engine.py` (real bid/ask), and the scanner `api/strategies/orb.py` (flat **1.6** pip) disagree. A "baseline" is undefined until one is chosen. `[VERIFIED backtest/engine.py:68-70; backtest/scalp_engine.py:78; api/strategies/orb.py:17,:197]`
5. **Holdout governance must live in the backend, not the brain or the UI.** The vault guard is already backend-enforced; the design must keep it that way and never let the Master Brain or a frontend action reach `load_vault`. `[VERIFIED engine/partition.py:55-70]`

**The recommended shape** (detail in §4, §10): *reuse the Judge/ledger/partition/scalp_engine unchanged; build the Trade-Intelligence ledger first (the plan's own #1); add a causal Regime snapshot as a pure, versioned module; expose runs over an async HTTP job API; surface all of it in the frontend through the already-reserved `DeskSource.getEngineObjects` seam and the `analytics`/`journal` window roles — mock-first, contract-tested.* Treat the single-pair variant family as **low priority** and route "different information" through the already-designed **RELAY** module, which is the repo's own sanctioned pivot. `[DOC RELAY_DESIGN.md:9-17, :66-71]`

---

## 2. Requirements traceability

Extracted from the plan; `R#` → design section → status. Status key: **EXISTS** (reuse), **EXTEND** (additive to existing), **NEW**, **CONFLICT** (plan vs repo), **DEFER**.

| R | Requirement (plan §) | Design § | Status | Evidence |
|---|---|---|---|---|
| R1 | Reproducible strategies; OBE is one worked example (§1,§8) — *reframed: strategy-agnostic factory, not an OBE project* | §4,§5 | **EXISTS** | any `strategy_fn` runs `[VERIFIED engine/runner.py:24-30]`; OBE reproducible `backtest/run_sample.py` |
| R2 | Evidence → regimes → LLM research → controlled tests, in that order (§1) | §8,§10 | **EXTEND** | matches `DEVELOPMENT_ROADMAP.md` order |
| R3 | Expectancy net of cost, not win rate (§1,§2,§9) | §5 | **EXISTS** | `[VERIFIED engine/judge.py:49, :102]` |
| R4 | Trading Engine: run OBE + reproducible sims; equity/metrics (§3.1) | §4 | **EXISTS** | `[VERIFIED engine/runner.py:58-70; backtest/engine.py]` |
| R5 | Trade Intelligence & Reporting; **build first** (§3.2,§5,§15) | §5,§10 | **NEW/partial** | partial `research/orb_forensics.py` autopsy; no structured ledger |
| R6 | Market Regime Engine: multi-dim state vector + confidence + data-quality (§3.3,§4) | §5,§10 | **NEW** | rule-based only `[VERIFIED market_context/structure.py:17; agents/technical_tree.py:131]` |
| R7 | Master Brain: propose hypotheses, draft sandbox code, never auto-promote (§3.4,§6) | §9,§10 | **NEW/partial** | deterministic coordinator exists `[VERIFIED agents/coordinator.py:85]`; LLM is no-op `[VERIFIED agents/narrator.py:53]` |
| R8 | Validation & Strategy Management: fixed gates, holdout, versioned library, promotion history (§3.5,§8) | §5,§9 | **EXISTS/EXTEND** | gates+vault+ledger `[VERIFIED engine/judge.py, partition.py, ledger.py]`; no promotion-history table |
| R9 | Market-data pipeline: bars, timestamps, spread/commission, features (§3) | §6 | **EXISTS/EXTEND** | OANDA+Timescale `[DOC SYSTEM_DOSSIER.md:170-181]`; **commission not modeled** `[VERIFIED backtest/engine.py:68]` |
| R10 | Experiment registry & version control (code ver, params, window, seeds) (§3,§6) | §5,§9 | **EXISTS/EXTEND** | ledger `[VERIFIED engine/ledger.py]`; lineage binder `freeze_spec` exists but **unused** `[VERIFIED engine/ledger.py:26-35]` |
| R11 | Execution & risk layer: sizing, exposure, stops, costs, **safety limits** (§3,§7.1) | §6,§9 | **EXISTS/partial** | sizing/stops/correlation `[VERIFIED risk/position_sizing.py:13]`; **no kill switch/DD cap** `[VERIFIED risk/ (grep: none)]` |
| R12 | Observability: log every decision, snapshot, selection, rejection, error (§3) | §8,§9 | **EXISTS/EXTEND** | `agents/audit.py` JSONL; ledger; no unified store |
| R13 | Multi-TF causal context; conflicts reported as conflict (§4.1) | §5 | **EXISTS/EXTEND** | `[VERIFIED market_context/context.py:26-38]` |
| R14 | Feature families direction/trend/vol/range/momentum/session/transition (§4.2) | §5 | **NEW/partial** | pieces exist (structure, displacement, atr_regime); not unified vector |
| R15 | Causal models (rule→cluster→HMM→changepoint); **filtered not smoothed**; DL/RL defer (§4.3) | §5,§11 | **NEW** | **no HMM/changepoint/clustering** `[VERIFIED market_context,forecast,agents grep: none]` |
| R16 | Per-trade record: identity/context/execution/exit(MFE,MAE,R)/decision-trace/lineage (§5.1) | §5 | **EXTEND** | `ScalpTrade` has prices/R/spread; **no regime id, decision trace, lineage** `[VERIFIED backtest/scalp_engine.py:31-45]` |
| R17 | Reports: trade-by-trade, loss taxonomy, regime-conditioned, potential-trade, comparison, integrity (§5.2) | §5,§7 | **NEW/partial** | loss taxonomy exists `[DOC NO_INTRADAY_EDGE.md:74]`; rest new |
| R18 | Potential trades defined by explicit causal setup rules (no hindsight) (§5.2) | §5 | **NEW** | — |
| R19 | LLM proposes/explains; deterministic calc/enforce/test/decide; 1 falsifiable hyp/exp (§6) | §9 | **NEW** | LLM not wired `[VERIFIED agents/narrator.py:53]` |
| R20 | Many distinct evidence-earning strategies/variants; each earns its place (§7) | §10,§11 | **EXTEND** | factory scope; registry/version library is the new piece (§5.4); avoid variants-to-hit-a-count `[DOC NO_INTRADAY_EDGE.md:60-64]` |
| R21 | Deterministic selector over *validated* strategies; no-trade allowed; separation of concerns (§7.1) | §4,§9 | **EXISTS/EXTEND** | coordinator veto/selection `[VERIFIED agents/coordinator.py:131-142]`; "validated-only" gate is new |
| R22 | Reproduce baseline; chrono splits+holdout; walk-forward; full cost; TZ/DST audit; track all exps; expectancy/PF/DD; ablations; regime diagnostics; shadow before live (§8) | §5,§6,§9 | **EXISTS/EXTEND** | most in Judge+partition+ledger; true expanding WF only in `research/walkforward_eurusd.py` `[VERIFIED]`; regime diagnostics new |
| R23 | Research / shadow / live modes with boundaries (§13) | §9 | **NEW/partial** | research mode = today; shadow = `agents/service.py` CLI; live not built |
| R24 | Promote only after tests+review; automation needs rollback/monitor/kill switch (§13) | §9 | **NEW** | — |
| R25 | Regime output schema (§12.1) | §5 | **NEW** | map to `RegimeSnapshot` `[PROPOSED]` |
| R26 | Minimum trade record schema (§12.2) | §5 | **EXTEND** | map to `TradeRecord` over `ScalpTrade` + Scan `outcome` |
| R27 | Design principles: separation, reproducibility, causality-first, LLM-proposes, no hindsight, no label-trust, keep failures (§14) | all | **EXISTS** | these are the repo's own first principles `[DOC DEVELOPMENT_ROADMAP.md:14-33]` |
| R28 | Immediate next: Trade Intelligence v0.1, then Regime Spec v0.1 (§15) | §10 | **NEW** | the plan of record below |
| R29 | HMM/regime repos are references only (§11) | §11 | **DOC** | non-functional |

---

## 3. Current-state audit (evidence, tagged)

Per-module: what exists / what's missing / what conflicts.

### 3.1 Trading Engine (plan module 1)
- **Exists:** `engine/runner.py:58-70` `run(Hypothesis, df)→RunResult` over `backtest/scalp_engine.py`; `backtest/engine.py` H1 mid-price engine; OBE strategy `backtest/strategies/order_block_reclaim.py:23`. `[VERIFIED]`
- **Real OBE numbers:** 401 trades, **32.17%** win, RR 2.0, **−16.40%** return, 37.7% maxDD — **run at zero cost**. `[VERIFIED backtest/results/sample_eurusd_h1.json; backtest/run_sample.py]`
- **Missing:** a canonical, cost-correct "baseline run" definition (three cost models disagree). `[VERIFIED §1 risk 4]`
- **Conflict:** plan's "43% win rate" — **not found**; OBE is 32.17%. `[VERIFIED]`

### 3.2 Trade Intelligence & Reporting (plan module 2) — "build first"
- **Exists (partial):** ORB forensic autopsy with loss taxonomy (BAD_DIRECTION/STALLED/EXIT_PROBLEM/COST_DOMINATED) and MFE/MAE in R. `[DOC NO_INTRADAY_EDGE.md:74-82; research/orb_forensics.py]` Scan already returns per-setup `outcome{result,r_multiple,net_pips,cost_pips,exit_reason,bars_held}`. `[VERIFIED frontend/docs/SCAN_CONTRACT.md]`
- **Missing:** a persisted structured per-trade record with **regime snapshot id, decision trace/reason codes, data lineage** (§5.1). `ScalpTrade` has prices/R/spread only; **no commission, no slippage field, no regime id, no lineage**. `[VERIFIED backtest/scalp_engine.py:31-45]`
- **Conflict:** none; this is the cleanest net-new value.

### 3.3 Market Regime Engine (plan module 3)
- **Exists:** rule-based trend (`_classify_trend` HH/HL→bullish) + BOS/CHoCH transition; causal MTF snapshot `build_context()`; ATR volatility band (`dead/normal/expanding`); one ML `atr_regime` feature. `[VERIFIED market_context/structure.py:17,:40; market_context/context.py:26-38; agents/technical_tree.py:131-150; forecast/features.py:45]`
- **Missing:** a single timestamped multi-dimensional **state vector** with calibrated probabilities + `available_at`; **no HMM/change-point/clustering/GMM anywhere**. `[VERIFIED grep across market_context,forecast,agents: none]`
- **Conflict:** plan §4.3 implies statistical models; none exist. Plan's causal rule (§4.3) is already the repo's #1 principle. `[DOC DEVELOPMENT_ROADMAP.md:14]`

### 3.4 Master Brain (plan module 4)
- **Exists:** `StrategyCoordinator` — weighted 3-tree aggregation, risk-first hard vetoes (`news_blackout`, `dead_volatility`, `no_directional_consensus`, `below_min_conviction/confidence`), confidence 0–10, append-only JSONL decision log, live CLI entrypoint `agents/service.py`. **Not exposed over HTTP.** `[VERIFIED agents/coordinator.py:85,:102,:131-142; agents/audit.py; agents/service.py]`
- **Missing:** the **LLM** layer (propose hypotheses, draft sandbox code, summarize) — `narrator.py:53` `use_llm` is a reserved no-op. No hypothesis-proposal/experiment-spec generator. `[VERIFIED agents/narrator.py:53-59]`
- **Conflict:** plan calls these "LLM agents"; the implementation is deliberately **deterministic** (backtestable) with LLM only as a future narrator. `[VERIFIED agents/README.md:8-21]` Reconcile: LLM is an *orchestration/authoring* layer, not a decision layer.

### 3.5 Validation & Strategy Management (plan module 5)
- **Exists:** the Judge (`judge_batch` with FDR), the vault, the append-only ledger, golden+adversarial tests. `[VERIFIED engine/judge.py:123-136; engine/partition.py; engine/ledger.py; engine/tests/]`
- **Missing:** (a) a **named evidence-tier ladder** (only `PASS/FAIL/INCONCLUSIVE` + TRAIN/VALID/VAULT exist); (b) a **versioned strategy library / promotion-history** table; (c) the **frozen-spec vault runner** — `freeze_spec` exists but has **no caller**; (d) **true expanding walk-forward** in the engine (engine does 4-fold chronological consistency; real WF only in a research script). `[VERIFIED engine/ledger.py:26-35 (unused); engine/runner.py:63-70; research/walkforward_eurusd.py]`

### 3.6 Infrastructure
- **Data pipeline:** OANDA v3 M1 bid/ask → TimescaleDB; calendar fetch; spread profile 1.6 pip. **Commission not modeled.** `[DOC SYSTEM_DOSSIER.md:170-181]` `[VERIFIED backtest/engine.py:68-70]`
- **Risk:** position sizing, ATR stops, RR targets, correlation-exposure **warning** (non-blocking, 0.7). **No kill switch / daily-loss / max-DD / exposure cap.** `[VERIFIED risk/position_sizing.py:13; risk/correlation.py:14]`
- **API:** FastAPI, routes `GET /api/health|strategies|bounds|candles`, `POST /api/scan` (synchronous; **no async jobs**); CORS `localhost:5173`. Backend registry exposes **only ORB**. `[VERIFIED api/main.py:4; api/routes.py:32-104; api/strategies/registry.py:5]`
- **Paper trading:** empty (`README` "TBD"). `[VERIFIED paper_trading/README.md]`
- **Frontend:** two source seams — Scan `DataSource` (live HTTP ready, `VITE_DATA_SOURCE=api`) and Desk `DeskSource` (mock-only, `"api"` reserved, documented `getEngineObjects` hook). Defaults to mock. 124 test files; zod contract + frozen fixtures. `analytics`/`journal` window roles are reserved placeholders. `[VERIFIED frontend/src/api/sourceFactory.ts:12; frontend/src/desk/source/deskSource.ts:1-3; frontend/src/window/WindowRoot.tsx:91-110]`
- **Duplicates:** ORB logic in ≥4 places (canonical `market_context/orb_strategy.py`, scanner `api/strategies/orb.py` "mirrors", index variant, research batches); order-block/SMC detector single-sourced (`ta_engine/smc.py`); indicators duplicated across `ta_engine/indicators.py` and `forecast/features.py`; frontend mock re-implements ORB + Silver Bullet in TS (DEV-only). `[VERIFIED api/strategies/orb.py:1-2; ta_engine/smc.py:5; forecast/features.py:23; frontend/src/api/mock/mockScanner.ts:1]`

---

## 4. Target architecture

**Principle:** extend existing modules; create a parallel one only where none exists. Ownership below ("owner" = the single module responsible for that data).

```
                         ┌────────────────────────── FRONTEND (integration surface) ──────────────────────────┐
                         │  Scan app        Desk app (cockpit)             Relay app        NEW surfaces        │
                         │  DataSource ───► /api/scan      DeskSource ──► getEngineObjects   analytics/journal   │
                         │  (live HTTP)                    (reserved "api" seam)             window roles        │
                         └───────┬───────────────────────────┬───────────────────────────────────┬────────────┘
                                 │ zod contracts + fixtures   │ Sourced<T> envelope               │
     ┌───────────────────────────▼────────────────────────────▼───────────────────────────────────▼───────────┐
     │                                    API (FastAPI, /api/*)  — EXTEND                                       │
     │   existing: /strategies /bounds /candles /scan      NEW: /trades /regime /experiments /jobs /validation  │
     │                                    async job lifecycle (NEW)                                             │
     └───────┬───────────────┬───────────────┬───────────────┬───────────────┬───────────────┬────────────────┘
             │               │               │               │               │               │
   ┌─────────▼───┐  ┌────────▼─────┐  ┌───────▼──────┐  ┌─────▼──────┐  ┌─────▼───────┐  ┌────▼────────────┐
   │ TradeIntel  │  │ RegimeEngine │  │ MasterBrain  │  │  Judge /   │  │ Coordinator │  │  Data / Risk     │
   │  (NEW)      │  │   (NEW)      │  │  (NEW: LLM   │  │ Validation │  │ (EXISTS,    │  │  (EXISTS,        │
   │ per-trade   │  │ causal state │  │  authoring   │  │ (EXISTS)   │  │  expose)    │  │  extend: kill    │
   │ ledger +    │  │ vector +     │  │  over Judge) │  │ gates/vault│  │ veto/select │  │  switch, commis- │
   │ reports     │  │ available_at │  │  propose only│  │ /ledger    │  │             │  │  sion, async)    │
   └──────┬──────┘  └──────┬───────┘  └──────┬───────┘  └─────┬──────┘  └─────┬───────┘  └────┬─────────────┘
          │                │                 │                │               │               │
          └────────────────┴───────reuse─────┴────────────────┴───────────────┴───────────────┘
                                 engine/ (partition, runner, judge, ledger)  ·  backtest/scalp_engine.py
                                 market_context/context.py  ·  ta_engine/  ·  data/ (OANDA+Timescale)
```

**Reused unchanged:** `engine/partition.py`, `engine/judge.py`, `engine/ledger.py`, `engine/runner.py`, `backtest/scalp_engine.py`, `ta_engine/*`, `data/*`, `market_context/context.py`. The golden/adversarial tests pin these; they must stay green (§10).

**New modules (single responsibility):**
- **`trade_intel/`** — owns the structured `TradeRecord` ledger and the reports (loss taxonomy, regime-conditioned performance, potential-trade analysis). Reads trades from `runner`/`scalp_engine`, enriches each with a `regime_snapshot_id` and `data_version`. Owner of trade-level evidence.
- **`regime/`** — owns the causal `RegimeSnapshot`. Pure function of candles-up-to-`t`; emits the §12.1 vector + `available_at`. Phase 1 = rule-based (wraps `market_context/context.py`); later phases add HMM/change-point *as additional dimensions behind the same contract*. Owner of market-state description.
- **`master_brain/`** — owns experiment *authoring* (LLM proposes a falsifiable hypothesis + drafts a sandbox strategy_fn + a test plan). It **calls** `ledger.register` and `runner.run` and `judge_batch`; it **cannot** call `load_vault`. Owner of research workflow, not of verdicts.
- **API extensions + `jobs/`** — async job lifecycle so long runs don't block HTTP.

**Extended, not forked:** `risk/` gains a stateful **safety module** (kill switch, daily-loss, max-DD, exposure cap) — currently absent. `agents/coordinator.py` gains an HTTP route and a "validated-strategies-only" selection gate. `backtest/engine.py`/`scalp_engine.py` gain an explicit **cost-model-version** field so a trade's lineage records which model produced it.

**Strategy-agnostic, with two guardrails:** the factory runs *any* strategy, so the architecture does not privilege ORB/OBE. Guardrail 1 — don't manufacture near-duplicate single-pair variants just to grow a count (the repo has shown that lane manufactures false positives); each strategy must be a distinct, pre-registered hypothesis. Guardrail 2 — **RELAY** remains the purpose-built home for cross-asset / different-information strategies and already reuses the Judge, so route those there rather than re-building a second validation stack. `[DOC NO_INTRADAY_EDGE.md:60-64; RELAY_DESIGN.md:66-71]`

---

## 5. Shared contracts

One identity model per entity, field-level, mapped onto existing types. All timestamps UTC seconds internally (frontend converts in `lib/time.ts`), ISO-UTC strings on the wire (matches `SCAN_CONTRACT.md`). Field names snake_case on the wire.

### 5.1 Causal timestamps (applies to every record)
Reuse the Desk four-timestamp model already in the DESK contracts, plus the plan's `available_at`:
- `t_event` — when the thing happened in market time.
- `known_at` / `available_at` — when it became knowable to a live system (bar close, data arrival). **This is the no-lookahead key** and is mandatory on `RegimeSnapshot` and any regime feature. `[DOC plan §12.1 "available_at"; mirrors DESK known_at]`
- `confirmed_at` — when a provisional label (e.g. a swing) became final.
- `decided_at` — lives on the **user/selector decision**, never on the object (DESK rule; keeps detection separate from decision). `[DOC frontend/docs/state-classification.md:70]`

### 5.2 `TradeRecord` (R16, R26) — EXTEND `ScalpTrade` + Scan `outcome`
```
TradeRecord {
  trade_id: str                       # NEW: stable id = hash(strategy_version, instrument, entry_time)
  strategy_id: str                    # EXISTS (ledger spec)
  strategy_version: str               # EXTEND: = ledger registration id (spec hash)   [engine/ledger.py:21]
  instrument, direction               # EXISTS [scalp_engine.py:33-34]
  entry_time, exit_time               # EXISTS (entry_ts/exit_ts)                      [scalp_engine.py:32]
  entry_price, exit_price             # EXISTS                                         [scalp_engine.py:35-36]
  entry_reason_codes: [str]           # EXTEND: structured, from strategy_fn (today: free-text `reason`) [scalp_engine.py:45]
  regime_snapshot_id: str             # NEW: FK → RegimeSnapshot.id (causal, known at entry)
  stop, target                        # NEW on record (engine has them, not stored)
  gross_pnl, net_pnl, R               # EXISTS (pnl_usd/net_pips/R; net already incl. spread) [scalp_engine.py:38-40]
  spread_cost                         # EXISTS (spread_at_entry)                        [scalp_engine.py:44]
  slippage                            # EXTEND: engine applies it but does not store it  [scalp_engine.py:87]
  commission                          # NEW: not modeled anywhere                        [backtest/engine.py:68]
  mfe_R, mae_R                        # NEW on record (forensics computes, not stored)   [research/orb_forensics.py]
  exit_reason                         # EXISTS (tp|sl|time|session_end)                  [scalp_engine.py:34]
  hold_min, session                   # EXISTS                                           [scalp_engine.py:41-42]
  data_version: str                   # NEW: dataset snapshot id (freeze_spec has the slot) [engine/ledger.py:26-35]
  code_commit, cost_model_version     # NEW: lineage (freeze_spec slots, currently unused)
  decision_trace: [DecisionStep]      # NEW: why allowed/rejected/modified/exited
}
```
Frontend already renders an `outcome{result,r_multiple,net_pips,cost_pips,exit_reason,bars_held}` per setup — `TradeRecord` is a superset and the Scan `outcome` is its projection. `[VERIFIED frontend/docs/SCAN_CONTRACT.md]`

### 5.3 `RegimeSnapshot` (R25) — NEW, map to `market_context.build_context`
```
RegimeSnapshot {
  id: str                             # hash(instrument, t_event, model_version)
  instrument, t_event                 # bar-close time
  available_at                        # NEW mandatory causal field
  direction: {bullish_p, bearish_p, neutral_p}   # today: rule trend → one-hot; later: calibrated probs
  trend_strength: float               # EXTEND from _classify_trend / efficiency ratio   [market_context/structure.py:17]
  volatility_state: dead|normal|expanding|extreme # EXTEND VolatilityAgent band          [agents/technical_tree.py:145]
  structure_state: trend|range|compression|transition # EXTEND BOS/CHoCH                  [market_context/structure.py:40]
  momentum_state: strengthening|stable|fading     # NEW
  transition_risk: float              # NEW (change score; later change-point)
  timeframe_alignment: aligned|mixed|conflict     # EXISTS mtf_aligned                    [market_context/context.py:38]
  data_quality: valid|degraded|absent # EXTEND (Desk Sourced<> already models this)       [deskSource.ts]
  model_version, rules_version        # EXISTS pattern (ledger rulesVersion)
}
```
Mapping rule: **the contract is stable; the model behind each field may evolve** (rule-based → statistical) without a UI change — exactly the `DeskSource.getEngineObjects` seam intent. `[VERIFIED frontend/src/desk/source/deskSource.ts:1-3]`

### 5.4 `ExperimentRecord` / `StrategyVersion` / `ValidationReport` — EXTEND the ledger
- `ExperimentRecord` already exists as the ledger register/result pair (`id`, `experiment_count`, `verdict{passed,n,expectancy_pips,win_rate,p_value,fold_pos_frac}`). `[VERIFIED engine/ledger.py:59-81]` **Extend** the result verdict to also persist: `fdr_alpha`, `split` (train|valid|vault), `evidence_tier`, `data_version`, `code_commit`.
- `StrategyVersion` = the ledger **registration id** (spec hash). Changing params/gate ⇒ new id ⇒ new version. Add a thin **promotion-history** view (derived, not a new source of truth) that lists, per `strategy_id`, the sequence of registration ids and their highest-reached tier.
- `ValidationReport` = `judge_batch` output `[Verdict]` serialized. `[VERIFIED engine/judge.py:123-136]`

### 5.5 Evidence tiers (plan: exploratory / in-sample / validated / vault-confirmed)
Code today has only `PASS|FAIL|INCONCLUSIVE` + TRAIN/VALID/VAULT. `[VERIFIED engine/judge.py:57]` **Propose** a derived, backend-computed `evidence_tier` enum (no new gate logic, just a label over existing facts):
| Tier | Definition (from existing facts) |
|---|---|
| `exploratory` | in-sample (TRAIN) result, or `/api/scan` output (already self-labels "Exploratory… not validated by the Judge" `[VERIFIED api/routes.py:98]`) |
| `in_sample` | ran through the Judge on TRAIN only, any status |
| `validated` | PASS on VALID after FDR, VAULT untouched |
| `vault_confirmed` | PASS via `load_vault(final_confirmation=True)` — the **only** tier the backend, not the brain, can grant |

### 5.6 `Job` (NEW)
```
Job { id, kind: scan|run|batch|regime|validate, status: queued|running|done|error,
      created_at, started_at, finished_at, progress, result_ref|error:{detail}, experiment_id? }
```

**Contract-testing rule:** every new response type gets a frozen fixture captured from **real backend output** (the existing `frontend/src/test/fixtures/*.json` pattern) and a zod parser with a `*.test.ts` — and `contractV2.test.ts` already proves additive fields are safe. `[VERIFIED frontend/src/types/contractV2.test.ts]`

---

## 6. API surface

**Framework:** extend the existing FastAPI app (`api/main.py:11` `create_app`). Keep the error body `{"detail": "..."}` and the snake_case/time conventions of `SCAN_CONTRACT.md`. CORS already `localhost:5173`. `[VERIFIED api/main.py:13; api/routes.py]`

**Versioning:** introduce `/api/v1/*` for new endpoints; leave the existing unversioned `/api/scan|candles|bounds|strategies` as-is (frontend httpSource hardcodes them `[VERIFIED frontend/src/api/httpSource.ts:16-25]`) and alias them under `/api/v1` for new clients. Additive only.

**New endpoints (all read unless noted):**
| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/trades?strategy&instrument&from&to&regime&session` | `TradeRecord[]` (the Intelligence ledger) |
| GET | `/api/v1/trades/{trade_id}` | one record incl. `decision_trace`, lineage |
| GET | `/api/v1/reports/loss-taxonomy?strategy` | grouped loss reasons (R17) |
| GET | `/api/v1/reports/regime-performance?strategy` | expectancy/PF/DD **per regime cell**, with `n` and an `insufficient_sample` flag when `n<30` (R3, risk 3) |
| GET | `/api/v1/regime?instrument&at` | `RegimeSnapshot` at/ before a time (causal) |
| GET | `/api/v1/experiments` | ledger view (`ExperimentRecord[]`, incl. `experiment_count`, tier) |
| POST | `/api/v1/experiments` (write) | pre-register a hypothesis → returns registration id (wraps `ledger.register`) |
| POST | `/api/v1/jobs` (write) | enqueue a `run`/`batch`/`validate`; returns `Job.id` |
| GET | `/api/v1/jobs/{id}` | poll job status/result |
| POST | `/api/v1/validate` (write) | run `judge_batch` on a set of runs; returns `ValidationReport` |
| GET | `/api/v1/coordinator?instrument` | expose `StrategyCoordinator.recommend()` (shadow only) `[VERIFIED agents/coordinator.py:102]` |

**Async job lifecycle (NEW):** `/api/scan` is synchronous today and the frontend masks it with a 120 s timeout `[VERIFIED frontend/src/api/httpSource.ts:25]`. Long runs (batches, vault) must become jobs: `POST /api/v1/jobs → 202 {id}`; worker runs `runner`/`judge`; client polls `GET /api/v1/jobs/{id}`. The frontend `DataSource`/`DeskSource` seam hides polling behind a promise, so UI code is unchanged. **Vault jobs require an explicit `final_confirmation` body flag and are refused otherwise** — the guard stays in `partition.py`, the API only forwards intent.

**Error format:** unchanged `{"detail": "..."}` with the existing status codes (404 unknown strategy, 422 bad params/range, add 409 for "vault already consulted" / "gate edited post-hoc"). `[VERIFIED api/routes.py]`

**Contract tests from real output:** capture fixtures by running the real backend once per endpoint and freezing the JSON (the `scanResult.json` precedent), then validate with zod + a `*.test.ts`. No endpoint ships without a fixture.

---

## 7. Frontend integration

**Navigation / surfaces (minimal change to existing apps):**
- **Scan** — unchanged. It already speaks `POST /api/scan` through `DataSource`; flipping `VITE_DATA_SOURCE=api` is all that's needed once backend strategy parity exists. `[VERIFIED frontend/src/scan/scanRunner.ts:122]`
- **Desk** — the primary host for Trade-Intelligence + Regime. Add two widgets to the existing registry (`widgetRegistry.ts` `WIDGETS`): a **Regime strip** (reads `RegimeSnapshot`) and a **Trade-Intelligence** panel (reads `TradeRecord[]`). Analytical objects arrive through the reserved `DeskSource.getEngineObjects` method rather than the client-side detector pipeline. `[VERIFIED frontend/src/desk/workspace/widgetRegistry.ts:24; frontend/src/desk/source/deskSource.ts:1-3]`
- **Relay** — the home for "different information" / cross-asset validation; already designed to reuse the Judge + show FDR/variant-count. The plan's regime-conditioning and result-ledger views overlap Relay's "Regime lens" and "Result ledger" — build them there, not twice. `[DOC RELAY_DESIGN.md:40-55]`
- **New surfaces via reserved roles:** `?window=analytics` → the **Experiment/Validation ledger** board (currently a `<Reserved/>` placeholder); `?window=journal` → the **Trade journal / decision log** popout. Both roles already exist in `role.ts`; only the component is new. `[VERIFIED frontend/src/window/role.ts:3-10; frontend/src/window/WindowRoot.tsx:91-110]`

**State classification for every new store** (per `docs/state-classification.md`; default local):
| Store (NEW) | Class | Replicated? | Persistence |
|---|---|---|---|
| `regimeStore` (current snapshot for the viewed pair/time) | **E** ephemeral (derived from source) | no | none |
| `tradeIntelStore` (filters, selected trade) | **W** window | no | none |
| `experimentStore` (ledger view, read-only cache) | **E** | no | none (re-fetch) |
| `jobStore` (in-flight jobs) | **E** | no | none |
| `brainStore` (proposed hypotheses, drafts) | **local + localStorage** `spekrym.desk.brain.v1` | **no** (Desk rule) | localStorage |
Rationale: backend-fed data is re-fetchable (ephemeral); user decisions/drafts follow the Desk local-only convention; nothing new goes on the sync bus unless it must cross windows (none does initially). `[VERIFIED frontend/docs/state-classification.md:66-78]`

**URL / deep-link:** extend `ShareState` (`urlState.ts:8-23`) additively with `trade` (trade_id), `exp` (experiment id), `regimeAt` (timestamp). A **trade-to-chart deep link** is `?pair=…&app=desk&trade=<id>` resolved by `applyShareState` against `tradeIntelStore`; no router needed (the scheme is query-param state-mirroring). `[VERIFIED frontend/src/url/urlState.ts:8-23; frontend/src/url/shareState.ts:19]`

**Multi-window:** the ledger board (`analytics`) and journal popout (`journal`) open as separate windows; they read backend data independently and need **no** sync binding (each re-fetches). Only promote a field to **G**/sync if two windows must share a live selection — defer until asked. `[VERIFIED frontend/src/sync/startSync.ts:31-63]`

**Mock-first strategy (so frontend-first work is not thrown away):** implement the reserved Desk `"api"` source and new endpoints' **mock impls first** (`mockDeskSource` + `deepMock` already exist), build every widget against mocks + fixtures, and switch `VITE_DATA_SOURCE=api` per surface once the real endpoint + fixture land. The zod contract guarantees the mock and the real backend satisfy the same shape. `[VERIFIED frontend/src/desk/source/mockDeskSource.ts; frontend/src/desk/source/deskSourceFactory.ts:14]`

---

## 8. End-to-end flows

**8.1 Main research loop (the plan's core).**
`Master Brain reads reports (/trades, /reports/*) → proposes one falsifiable hypothesis → POST /experiments (ledger.register, immutable id) → POST /jobs{run on TRAIN/VALID} → judge_batch (FDR across batch) → ledger result + evidence_tier → analytics board shows verdict + experiment_count.` The brain never writes a verdict; the Judge does. `[VERIFIED engine/ledger.py:59-66; engine/judge.py:123-136]`

**8.2 Trade-to-chart deep link.** Journal/Intelligence panel row → `?app=desk&pair=…&trade=<id>` → Desk loads the `TradeRecord`, centers the chart on `entry_time..exit_time`, overlays the `regime_snapshot_id` state and the `decision_trace`. Reuses Desk focus + annotation rendering. `[VERIFIED frontend/src/url/shareState.ts:19]`

**8.3 Hypothesis → validation → promotion.** `exploratory` (scan/TRAIN) → `in_sample` (Judge on TRAIN) → `validated` (PASS on VALID after FDR) → human review → **one** `vault_confirmed` run via `load_vault(final_confirmation=True)` (backend-gated, logged). Promotion history is appended to the ledger; the UI shows the tier but cannot change it. `[VERIFIED engine/partition.py:55-70]`

**8.4 Failure paths.**
- *Job failure* → `Job.status=error{detail}`; UI shows the detail; ledger unaffected (register already happened, result simply absent). 
- *Data / cost-model drift* → each `TradeRecord` carries `cost_model_version`+`data_version`; a mismatch between a run and the baseline is surfaced as a warning, not silently reconciled (the three-cost-model problem, §1 risk 4). 
- *Regime model change* → `model_version`/`rules_version` on every snapshot; changing the regime model invalidates cached conditioned reports (re-fetch), never rewrites stored trades. 
- *Holdout access* → any vault read without `final_confirmation` → `PermissionError` → API 409; the vault-consultation counter is shown in the ledger board so wear is visible. `[VERIFIED engine/partition.py:44-52,:62-65]`

---

## 9. Validation & governance

- **Who decides what.** The **Master Brain / LLM may only propose** (hypotheses, draft code, summaries). Deterministic code computes metrics; the **Judge** decides PASS/FAIL/INCONCLUSIVE; a **human** authorizes the single vault confirmation. This is the repo's "referee before players" rule, now enforced by module boundaries. `[DOC DEVELOPMENT_ROADMAP.md:14-19]` `[VERIFIED engine/judge.py:11-12 "the strategy's author cannot argue with it"]`
- **Backend enforces holdout, not the UI.** `load_vault` lives in `partition.py` behind `final_confirmation=True`, counts+logs every read; no frontend action and no brain call may reach it — the API forwards intent only and refuses otherwise. `[VERIFIED engine/partition.py:55-70]`
- **Append-only, tamper-evident.** Pre-registration binds the gate by hash; post-hoc gate edits are rejected. New endpoints must go through `ledger.register`/`record_result`, never write the JSONL directly. `[VERIFIED engine/ledger.py:72-77]`
- **Multiple-testing is shown.** Every result carries `experiment_count` and FDR status; the UI must display "tested N variants" next to any surviving result (Relay already specifies this). `[VERIFIED engine/judge.py:70-84]` `[DOC RELAY_DESIGN.md:56-60]`
- **Safety for any future live mode.** Live is out of scope here, but the design reserves: a stateful `risk/safety` module (kill switch, daily-loss, max-DD, exposure cap) that does not exist yet and **must** precede any execution. `[VERIFIED risk/ grep: none]`

---

## 10. Phased implementation plan

**Convention (repo rule):** one phase per working session; pure logic → wiring → chrome; additive & backward-compatible; typecheck+tests+build green; report files only; never auto-start the next. `[DOC frontend/MASTER_ROADMAP.md:68-69]` Frontend phases (FE) and backend tracks (BE) interleave; FE builds against mocks so it never blocks on BE.

| Phase | Deliverable | Depends on | Definition of done | Test plan |
|---|---|---|---|---|
| **BE-0** | Decide the **one cost model** all strategies are scored on; add `cost_model_version` to engine outputs; define the fair/random-entry reference line (not a champion strategy) | §11 OQ-1,OQ-2 | every strategy scored on one comparable cost basis; reference line documented | golden tests still green; test asserts reference reproducible |
| **BE-1b** | **Strategy registry / version library** (plan module 5): list strategies, their registration ids, highest tier — the factory's catalog | ledger (exists) | catalog view over the ledger, read-only | test: registering a variant adds a version, changes id |
| **BE-1** | `trade_intel/` `TradeRecord` schema + writer enriching `ScalpTrade` with `regime_snapshot_id` placeholder + lineage (`freeze_spec` wired at last) | BE-0 | every backtested trade persists a `TradeRecord` | unit: record has all §5.2 fields; lineage id changes with code/data/cost |
| **FE-1** | Trade-Intelligence panel + journal popout (`?window=journal`), **mock source** + fixtures | DESK infra (exists) | panel renders mock `TradeRecord[]`, deep-link works | `*.test.tsx` + fixture zod parse; 124-suite stays green |
| **BE-2** | `GET /api/v1/trades`, `/trades/{id}`, `/reports/loss-taxonomy` (sync reads) | BE-1 | endpoints return real records; fixtures captured | `api/tests` contract test; frozen fixture |
| **FE-2** | Flip Trade-Intelligence panel to `VITE_DATA_SOURCE=api` for that surface; regime-performance table with `insufficient_sample` flag | BE-2 | real data in UI; small cells flagged | contract test vs real fixture |
| **BE-3** | `regime/` module: causal `RegimeSnapshot` v0.1 (rule-based, wraps `context.py`) + `GET /api/v1/regime` | BE-0 | snapshot is pure, causal (no-lookahead test) | adversarial no-future-leak test mirroring `engine/tests/test_adversarial.py` |
| **FE-3** | Regime strip widget in Desk, mock→api | BE-3 | regime shown at viewed time; `available_at` respected | widget test; causal fixture |
| **BE-4** | Async `jobs/` + `POST /api/v1/jobs` + `GET /jobs/{id}`; move batch/vault runs to jobs | — | long run returns 202+id; poll to result | job lifecycle test; vault job refused without `final_confirmation` |
| **FE-4** | Experiment/Validation ledger board (`?window=analytics`): verdicts, `experiment_count`, tier, vault-consultation counter | BE-4, ledger (exists) | board lists real experiments read-only | contract test; tier mapping test |
| **BE-5** | `evidence_tier` label over existing facts; promotion-history view; extend verdict record fields | ledger (exists) | tiers computed, no new gate logic | test tier transitions on fixture ledger |
| **BE-6** | Expose `StrategyCoordinator.recommend()` at `GET /api/v1/coordinator` (shadow only) + "validated-only" selection gate | coordinator (exists) | recommendation served; unvalidated strategies excluded | `agents/tests/test_coordinator.py` stays green + new gate test |
| **BE-7** | `master_brain/` v0.1: LLM proposes a hypothesis spec + drafts a sandbox strategy_fn + test plan; human-approve before `ledger.register` | BE-4, BE-5 | proposal → registered experiment, no auto-promote | test: proposal cannot write a verdict or reach `load_vault` |
| **BE-8** (deferred) | `risk/safety` stateful module (kill switch, daily-loss, max-DD, exposure cap) | — | limits enforced in a sim harness | new `risk/tests` |

**Parallel/independent:** RELAY cross-asset work proceeds on its own phases (`RELAY_PHASES.md`) and is the preferred home for new *information*, not new single-pair variants.

**Regression safety net — must stay green throughout:** `engine/tests/*` (ledger/partition/judge/runner/adversarial/golden/end_to_end), `backtest/tests/{test_engine,test_scalp_engine,test_risk,test_currency}.py`, `agents/tests/{test_agents,test_coordinator}.py`, `api/tests/test_api.py`, `market_context/tests/*`, `ta_engine/tests/*`, and the frontend 124-file suite incl. `types/schemas.test.ts` + `contractV2.test.ts`. `[VERIFIED per §3 audits]` (`test_datacache.py` needs the DB; run it only where Timescale is up.)

---

## 11. Risks & open decisions (each with a recommended default)

- **OQ-1 — Baseline cost model.** *Default:* adopt **`scalp_engine.py` real bid/ask** as the one true baseline (it's the most realistic and the Judge is built on it); treat the scanner's flat 1.6 and `engine.py`'s 0.6/0.1 as *diagnostic* references only. *Changes if:* you intend H1 mid-price day-trading as the product, in which case standardize on `engine.py` with explicit 0.6/0.1. `[VERIFIED backtest/scalp_engine.py:1-7]`
- **OQ-2 — What is the "baseline" every new strategy is compared against?** (Reframed for the strategy-factory scope.) *Default:* the baseline is **not any one strategy** — it is the **fair/random-entry null net of cost** the Judge already computes (`stop/(stop+target)` vs cost-adjusted break-even), so every authored strategy is measured against "no edge" on a comparable cost basis. Keep OBE as a worked **negative example** in the ledger, not the thing to beat. *Changes if:* you want a specific champion strategy as the reference line for a given family — then freeze that one via `freeze_spec` and compare within the family. `[VERIFIED engine/judge.py:33-39]`
- **OQ-3 — Does a regime layer get a pass to re-open single-pair variants?** *Default:* **no** — the forensics show a signal failure that conditioning cannot fix; a regime cell still needs ≥30 trades and must beat the fair rate net of cost. Build the regime engine for *description and honest reporting*, not to manufacture a conditioned edge. *Changes if:* a pre-registered regime-conditioned hypothesis clears VALID after FDR. `[DOC NO_INTRADAY_EDGE.md:60-64,:82]`
- **OQ-4 — Where do Trade-Intelligence + Regime live: Desk or a new app?** *Default:* **Desk** (reuse its widget registry, dock, Sourced<> envelope, local-state discipline); use the reserved `analytics`/`journal` roles for ledger/journal popouts. A fourth top-level app is unnecessary. *Changes if:* you want a standalone "Intelligence" product separate from discretionary Desk. `[VERIFIED frontend/src/desk/workspace/widgetRegistry.ts]`
- **OQ-5 — Regime model class for v0.1.** *Default:* **rule-based wrapping `context.py`** behind the `RegimeSnapshot` contract; add HMM/change-point later as extra dimensions, same contract, causal-filtered (never smoothed). *Changes if:* you want to validate an HMM first — still gets the same no-lookahead adversarial test. `[DOC plan §4.3]`
- **OQ-6 — LLM provider for the Master Brain.** *Default:* keep the LLM **out of numerical truth**; use it only to author hypotheses/drafts/summaries, human-approved before `ledger.register`. Provider choice deferred to BE-7; the deterministic coordinator remains the decision aggregator. *Changes if:* you want an autonomous proposer (V4 heartbeat) — only after the manual loop is proven. `[DOC DEVELOPMENT_ROADMAP.md:95-99; plan §6.2]`
- **OQ-7 — Doc location for this file.** *Default:* repo-root `docs/INTEGRATION_DESIGN.md` (this file), since it spans backend+frontend. *Changes if:* you prefer it under `frontend/docs/` beside the DK/SCAN docs.
- **OQ-8 — Async jobs now or later.** *Default:* **later (BE-4)** — the 120 s sync timeout is tolerable for current scan sizes; introduce jobs when batch/vault runs land. *Changes if:* real-data scans routinely exceed ~60 s. `[VERIFIED frontend/src/api/httpSource.ts:25]`
- **OQ-9 — Backend strategy parity.** *Default:* keep the backend registry as the source of truth (ORB only today); **do not** promise Silver Bullet/MA-cross from the API until implemented in `api/strategies/` — they are frontend mocks. Hide unimplemented strategies when `VITE_DATA_SOURCE=api`. *Changes if:* you want those strategies real — each is its own phase. `[VERIFIED api/strategies/registry.py:5; frontend/src/api/mock/mockStrategies.ts]`
- **OQ-10 — Commission modeling.** *Default:* add a `commission_per_trade` field threaded into `TradeRecord` and the cost model (currently 0 everywhere) so lineage is honest even if the value is 0 for OANDA spread-only. *Changes if:* you move to a commission broker. `[VERIFIED backtest/engine.py:68]`

---

## 12. Appendix — files/dirs inspected

**Read directly (this session):** `forex_trading_intelligence_system_plan.docx` (full), `SYSTEM_DOSSIER.md`, `DEVELOPMENT_ROADMAP.md`, `RELAY_DESIGN.md`, `frontend/MASTER_ROADMAP.md`, `frontend/docs/SCAN_CONTRACT.md`, `frontend/docs/state-classification.md`, `frontend/src/window/role.ts`, `frontend/src/api/dataSource.ts`, `frontend/src/api/sourceFactory.ts`, `frontend/src/api/httpSource.ts`; repo tree (root + `frontend/src/desk`).

**Audited via evidence sub-agents (path:line in §3):** `engine/` (judge, runner, ledger, partition, datacache, tests), `research/`; `backtest/` (engine, scalp_engine, strategies/order_block_reclaim, results, run_*, tests) + root CSVs/forensics docs (`NO_INTRADAY_EDGE.md`, `SCALP_FINDINGS.md`, `STRATEGY_FORENSICS.md`, `BACKTEST_INTEGRITY_AUDIT.md`, `SYSTEM_STRATEGY_AND_EDGE.md`, `LABEL_TRADE_ALIGNMENT.md`, trade CSVs); `market_context/`, `risk/`, `agents/`, `api/`, `forecast/`, `ta_engine/`, `paper_trading/`; `frontend/src` (api/mock, desk/source, desk/detect, desk/kernel, window, sync, stores, commands, url, analytics, test fixtures).

**Not inspected / could not confirm:** `[UNKNOWN]` `data/` migrations beyond `004_bidask` (DOC only); live TimescaleDB contents (DB not queried); `agent_workspace/`, `tracking/`, `forecast/results/` beyond the two cited files; `STRATEGY_TOOLING_BUILD_PLAN` (referenced in the task prompt but **no such file found** in the repo — the nearest is `frontend/MASTER_ROADMAP.md` + `frontend` DK docs); any out-of-repo OBE implementation the plan's "43%" might refer to.

---

## Phase D — self-review: remaining weaknesses

1. **Cost-model + reference-line choice (OQ-1/OQ-2) still gates comparability.** With the strategy-factory scope the OBE-baseline conflict dissolves, but a factory that scores strategies on *different* cost models produces incomparable verdicts. BE-0 must land one cost model and a fair/random reference before many strategies are run, or cross-strategy comparison is meaningless.
2. **Regime-conditioning may be structurally underpowered.** With 85–180 real trades and a 30-trade floor, most regime cells will be `INCONCLUSIVE`. The design surfaces this (`insufficient_sample` flag) but cannot create statistical power that the data lacks. This is honest but may disappoint the plan's regime-performance ambitions.
3. **`[UNKNOWN]` items remain** (live DB contents, the missing `STRATEGY_TOOLING_BUILD_PLAN`, any external OBE). These are in the questions list; the design does not assume their contents.
4. **Master-Brain/LLM section is deliberately thin** (BE-7) — authoring-only, provider-deferred. That is the correct altitude for a design review but means the plan's "LLM layer" is the least-specified part here, by choice (automate only a proven loop).
5. **No new statistical regime model is validated in this doc** — I specify the *contract* and the *causal test*, not the model. HMM/change-point quality (calibration, label stability) is a research question the Judge must answer later, not a design guarantee.
6. **Cross-module overlap with RELAY** (regime lens, result ledger) could cause duplication if phases aren't coordinated; §7 says "build once in Relay," but the exact split between a Desk regime strip and Relay's regime lens needs a follow-up decision when those phases are scheduled.
7. **Traceability is complete** (R1–R29 all mapped) and **every factual claim is tagged**; the main residual softness is that several `[DOC]` conclusions (the negative edge findings) are backed by the repo's own research rather than re-derived here — consistent with "do not invent numbers," but they inherit the repo's methodology rather than an independent re-run.
