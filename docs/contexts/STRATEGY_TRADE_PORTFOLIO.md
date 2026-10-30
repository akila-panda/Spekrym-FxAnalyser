# Context Deep-Dive — Strategy / Trade / Portfolio (Bounded Context #5)

Part of `docs/MASTER_DEVELOPMENT_PLAN.md` (Part II §5, context #5). Companion to the sibling context docs. Tags: **EXISTS / EXTEND / NEW / CONDITIONAL / DEFER**; evidence `[VERIFIED path:line]` (read 2026-10-22), `[DOC]`, `[PROPOSED]`.

> **One-line role:** manage *validated* strategies as a catalog, record every trading decision (taken, rejected, missed, counterfactual) without survival bias, select among validated strategies for shadow/live, and reason about the portfolio as one combined book — never confusing a discretionary idea with a validated signal.

---

## 1. Mission & boundary

**Owns.** The strategy registry / version library; signal observation; the opportunity + trade journal (Trade Intelligence); the validated-strategy selector; portfolio replay + exposure; and live allocation.

**Produces.** `EligibilityDecision`, `TradeRecord`, `OpportunityRecord`, `DecisionTrace`, `PortfolioExposure` — all audited and versioned.

**Explicitly does NOT own:**
- *Whether a strategy is valid* — that is [Research OS](./RESEARCH_OS.md) + the Judge. This context consumes a `ValidationReport`/evidence tier; it never self-certifies.
- *Order placement, kill switch, risk veto* — that is [Safety / Execution](./SAFETY_EXECUTION.md). Selection is separate from sizing and execution, and risk may veto anything here.
- *Market description / regime* — that is [Market Intelligence](./MARKET_INTELLIGENCE.md); the selector *consumes* `RegimeSnapshot` as eligibility conditions.
- *Scenario authoring* — a scenario path ≠ a setup; promotion to a tradeable signal happens only through validated strategy logic.

Boundary rule: *this context answers "which validated strategy is eligible now, what did it (and would it have) done, and how do the strategies combine?" — not "is the edge real?" (Judge) and not "place the order" (Safety).*

---

## 2. Current state (audited)

A deterministic coordinator "brain" already exists and is strong, but it is **not exposed over HTTP**, there is **no structured trade ledger**, and nothing distinguishes a *validated* strategy for live use.

| Capability | Status | Evidence |
|---|---|---|
| **`StrategyCoordinator`** — weighted 3-tree aggregation, confidence 0–10, confidence-scaled risk, per-tree audit | **EXISTS** | `[VERIFIED agents/coordinator.py:85, 102, 127, 158]` |
| **Risk-first hard-veto gates** (news_blackout, dead_volatility, no_directional_consensus, below_min_conviction, below_min_confidence) | **EXISTS** | `[VERIFIED agents/coordinator.py:133-142]` |
| `Recommendation` + `to_signal()` (adapts to the backtest engine) | **EXISTS** | `[VERIFIED agents/coordinator.py:31-37, 70-78]` |
| Append-only JSONL decision log; live CLI entrypoint | **EXISTS** | `agents/audit.py`; `agents/service.py` |
| Example strategy (OBE / order-block reclaim) — real numbers 401 trades / 32.17% win / −16.4% / "No edge" | **EXISTS** | `[VERIFIED backtest/strategies/order_block_reclaim.py; backtest/results/sample_eurusd_h1.json]` |
| Backend scanner serves **only ORB** | **EXISTS (thin)** | `[VERIFIED api/strategies/registry.py:5]` |
| Per-setup **outcome contract** (result/r_multiple/net_pips/cost_pips) + summary (win_rate/expectancy_r) | **EXISTS (frontend)** | `[VERIFIED frontend/src/types/schemas.ts:269-273, 310-319]` |
| Manual what-if-R editor (counterfactual seed) | **EXISTS** | `[VERIFIED frontend/src/components/setups/WhatIfEditor.tsx]` |
| Risk primitives: position sizing, ATR stops, RR targets, correlation-exposure **warning** | **EXISTS (partial)** | `risk/{position_sizing,stops,currency,correlation}.py` (correlation warns, doesn't block) |
| Coordinator exposed over HTTP | **MISSING** | no route calls `StrategyCoordinator` |
| **Validated-only selector gate** (exclude un-validated strategies from live) | **MISSING** | coordinator trades any signal |
| **Structured `TradeRecord`** (regime id, decision trace, lineage, slippage, commission) | **MISSING** | `ScalpTrade` has prices/R/spread only |
| **4-category decision/opportunity ledger** (executed / rejected / eligible / counterfactual) | **MISSING** | only executed trades are logged → survival bias |
| **Strategy registry / version library + promotion history** | **MISSING** | (co-owned with [Research OS](./RESEARCH_OS.md) Contract 1) |
| **Portfolio Intelligence + Simulator** (combined book on one clock) | **MISSING** | strategies evaluated individually |
| **Strategy Lifecycle & Decay monitoring** | **MISSING** | no Candidate→…→Retired states |

**Honest anchors:** the only real executed-trade sets are small — **85** (forecast) and **180** (scalp) — so regime-conditioned slicing hits the 30-trade Judge floor fast; the example strategy is "No edge". This context must therefore make *rejection and absence* first-class (the 4 categories), not just log winners.

---

## 3. Internal components / modules

| Component | Responsibility | Today | Target |
|---|---|---|---|
| **Strategy registry / version library** (`trading/strategy-registry`) | Catalog of strategies, versions (= spec hash), highest tier | **NEW** (co-owned w/ Research OS) | search, duplicate detection, promotion history |
| **Trade Intelligence ledger** (`trading/trade-intel`) | The 4-category decision/opportunity record + reports | **NEW** (enrich `ScalpTrade`) | no survival bias |
| **Signal observation** (`trading/opportunities`) | Observe validated-strategy conditions + eligible opportunities | **NEW** | distinct from discretionary setups |
| **Selector** (`trading/strategy-registry` + coordinator) | Choose among *validated* strategies under current regime | EXISTS (coordinator) | add validated-only eligibility gate; expose over HTTP (shadow) |
| **Portfolio Intelligence + Simulator** (`trading/portfolio`) | Combined book on one clock/account/margin | **NEW** | real portfolio equity, not summed returns |
| **Lifecycle & Decay** (`trading/strategy-registry`) | Candidate→Validated→Shadow→Active→Suspended→Retired | **NEW** | statistically-justified thresholds |
| **Risk primitives** (`risk/`) | Sizing/stops/correlation inputs to the selector | EXISTS | hand off blocking/kill to [Safety / Execution](./SAFETY_EXECUTION.md) |

---

## 4. Owned records & contracts (field-level)

### `TradeRecord` + the 4 categories (NEW — enrich `backtest/scalp_engine.py ScalpTrade`)
```
TradeRecord {
  trade_id; strategy_id; strategy_version          # version = ledger spec hash
  category: "executed" | "rejected" | "eligible" | "counterfactual"   # the 4 categories
  instrument; direction; entry_time; exit_time
  entry_price; exit_price; stop; target
  entry_reason_codes[]                              # structured (today: free-text `reason`)
  regime_snapshot_id                                # FK → RegimeSnapshot (known at entry)
  gross_pnl; net_pnl; R; mfe_R; mae_R
  spread_cost; slippage; commission                 # commission NEW; slippage now stored
  exit_reason; hold_min; session
  decision_trace: DecisionStep[]                    # why allowed/rejected/modified/exited
  data_version; code_commit; cost_model_version     # lineage
}
```
- **executed** — what the strategy did (today's `ScalpTrade`).
- **rejected** — a setup identified but filtered out (why).
- **eligible** — satisfied a predefined opportunity definition (taken or not).
- **counterfactual** — what a predefined alternative policy would have produced (labelled hypothetical).

### `EligibilityDecision` (NEW — from the selector)
```
EligibilityDecision {
  strategy_id; strategy_version; evidence_tier       # validated/vault_confirmed required for live
  instrument; asOf
  eligible: bool; reasons[]                          # which regime/policy rule caused it
  regime_snapshot_id; gatesFired[]                   # reuse coordinator veto gates
}
```

### `PortfolioExposure` (NEW — from the Portfolio Simulator)
```
PortfolioExposure {
  asOf; strategies[]; openPositions[]
  currencyExposure{ USD, EUR, ... }                  # currency-level, overlapping base/quote
  portfolioDrawdown; tailRisk; correlationState
  marginalRiskContribution{ strategyId → number }
  constraints[]; vetoes[]                            # from Safety/Execution
}
```

### `DecisionTrace` (NEW)
Ordered steps `{ at, step: allowed|rejected|modified|exited, rule, evidenceIds[] }` — the audit trail for every decision; reuses the coordinator's `gates`/per-tree audit shape.

---

## 5. Interfaces — produces / consumes

| Direction | Counterparty | Contract / purpose |
|---|---|---|
| consumes ← | [Research OS](./RESEARCH_OS.md) | `ValidationReport` + evidence tier → only validated/vault_confirmed are live-eligible |
| consumes ← | [Market Intelligence](./MARKET_INTELLIGENCE.md) | `RegimeSnapshot` → eligibility conditions |
| consumes ← | [Scenario Intelligence](./SCENARIO_INTELLIGENCE.md) | a scenario may seed an opportunity (path ≠ setup) |
| produces → | [Safety / Execution](./SAFETY_EXECUTION.md) | `EligibilityDecision` + proposed sizing → risk veto + execution |
| produces → | [Experience Plane](./EXPERIENCE_PLANE.md) | `TradeRecord`s (journal), `PortfolioExposure` (Portfolio Command), eligibility (Desk readiness) |
| produces → | [Research OS](./RESEARCH_OS.md) | `TradeRecord`s feed trade-level evidence + lifecycle decisions back into research |
| shares with | [Scenario Intelligence](./SCENARIO_INTELLIGENCE.md) | the counterfactual engine |

---

## 6. Guardrails & invariants
1. **Discretionary ≠ validated.** A Desk setup and a validated strategy signal are different types with different visual identities and evidence requirements; they are never silently merged. (Rule #4; the 5-type distinction: a **Signal** requires validated strategy logic.)
2. **Validated-only for live.** Only a `validated`/`vault_confirmed` strategy version is eligible for shadow/live selection; the selector reads the tier from [Research OS](./RESEARCH_OS.md). (Rule #3.)
3. **No survival bias.** Rejected setups and eligible-but-untaken opportunities are logged alongside executed trades, so loss/selection analysis is honest.
4. **Selection separate from sizing + execution.** The selector chooses *which* validated strategy; sizing and the order path (and any veto/kill) belong to [Safety / Execution](./SAFETY_EXECUTION.md).
5. **Portfolio = combined decisions on one clock.** Portfolio equity comes from replaying all strategy decisions against one shared account/margin/execution — never from summing individual strategy returns.
6. **Decay thresholds are statistically justified.** A strategy is not declared decayed after a few losers; suspension needs sufficient observations and an audited reason, and can happen without changing source code.
7. **Record which evidence + rule caused each selection** (`EligibilityDecision.reasons`) — reproducible, auditable, no black-box picks.

---

## 7. Phases that build it (from the Master Plan)

| Phase | Deliverable | Depends | Definition of Done | Test plan |
|---|---|---|---|---|
| **W2.1** | **`TradeRecord` 4-category ledger**: enrich `ScalpTrade` with regime_snapshot_id + decision_trace + slippage + commission + lineage | W0.4, W1.3 | every backtested decision persists a typed record across 4 categories | schema-completeness + survival-bias (rejected logged) tests |
| **W2.2** | **Reports**: loss taxonomy, regime-conditioned performance w/ `insufficient_sample` (n<30), potential-trade analysis, comparison | W2.1 | reports per strategy; small cells flagged | report-correctness tests; insufficient-sample-flag test |
| **W2.3** | **Trade endpoints** `GET /trades`, `/trades/{id}`, `/reports/*` + fixtures | W2.1 | real records served; fixtures frozen | `api/tests` contract tests |
| **W2.4** | **FE: Trade-Intelligence panel + journal popout** (`?window=journal`), mock→api | W2.3 | records render; trade deep-link works | `*.test.tsx`; 124-suite green |
| **W7.1** | **Expose coordinator + validated-only Selector** (`GET /coordinator`, shadow); exclude un-validated strategies | W1.4 | recommendation served; only validated eligible | `agents/tests/test_coordinator.py` green + eligibility-gate test |
| **W7.2** | **Portfolio Intelligence + Simulator** (one shared clock/account/margin; cross-strategy dependence, currency exposure, DD/tail, allocation under limits) | W7.1 | portfolio equity from combined decisions, not summed | portfolio-simulator correctness test |
| **W7.3** | **Strategy Lifecycle & Decay** (Candidate→Validated→Shadow→Active→Suspended→Retired; thresholds; suspend without code change) | W7.1, [Safety / Execution](./SAFETY_EXECUTION.md) | lifecycle transitions enforced + audited | decay-threshold + suspension-audit tests |
| **(feature)** | **Strategy Compatibility Radar** (which validated strategies eligible vs excluded now) | W7.1 | eligibility matrix per current conditions | eligibility-matrix test |

---

## 8. Context-specific acceptance tests
- **Discretionary vs validated:** a Desk setup and a validated signal render with distinct identities and cannot be promoted into one another without passing the Judge.
- **Validated-only live:** the selector refuses to make an un-validated strategy live-eligible.
- **No survival bias:** a loss-analysis report changes when rejected/eligible records are present vs absent (proving they're counted).
- **Insufficient sample:** a regime cell with n<30 is flagged, never reported as a confident number.
- **Portfolio combination:** three individually-eligible strategies with correlated EUR/USD + GBP/USD longs surface a combined currency-exposure constraint the single-strategy view misses.
- **Decay discipline:** a short losing streak does not trigger suspension; a statistically-justified threshold breach does, with an audited reason.
- **Selection audit:** every `EligibilityDecision` records the regime evidence + policy rule that caused it.

---

## 9. Open decisions affecting this context
- **Decision 4 Authority** — decision-support vs shadow-only vs authorized live execution. Sets how far W7/W8 go. Recommended: **shadow first**, live only after [Safety / Execution](./SAFETY_EXECUTION.md) + separate human authorization.
- **Decision 1 Target users** — single expert vs team → who can promote/suspend strategies (permission model).
- **Decision 3 Instruments** — portfolio currency-exposure math needs the broader instrument set to be meaningful (metals/indices change the exposure picture).
- **Strategy representation** — formal spec vs Python plugin (shared Contract 1 with [Research OS](./RESEARCH_OS.md)); recommended both behind one interface.
- **Selector policy form** — deterministic permission/veto mapping first (reuse coordinator gates) vs soft/probabilistic allocation later. Recommended: deterministic first, evaluated before any soft allocation.

---

## 10. Code namespaces & tests to keep green
**Proposed namespaces:** `trading/{strategy-registry,opportunities,trade-intel,portfolio,execution,risk}` (execution/risk blocking logic actually lives under [Safety / Execution](./SAFETY_EXECUTION.md)).
**Existing to extend:** `agents/coordinator.py` (selector + veto gates), `agents/audit.py` (decision log), `backtest/scalp_engine.py` (`ScalpTrade` → `TradeRecord`), `risk/*` (sizing/stops inputs), frontend `desk/plan` + `desk/journal` + Scan outcome schema.
**Tests that must stay green:** `agents/tests/{test_agents,test_coordinator}.py`, `backtest/tests/{test_engine,test_scalp_engine,test_risk,test_currency}.py`, `api/tests/test_api.py`, and the frontend Scan/Desk journal/plan suites. Extensions are additive.

---

## 11. Cross-context dependencies
- **Gated by** [Research OS](./RESEARCH_OS.md): evidence tier decides live eligibility; the strategy registry/version library is co-owned (authored/catalogued here, governed there).
- **Conditioned by** [Market Intelligence](./MARKET_INTELLIGENCE.md): `RegimeSnapshot` drives selector eligibility.
- **Vetoed/executed by** [Safety / Execution](./SAFETY_EXECUTION.md): selection hands an `EligibilityDecision` + proposed sizing over; risk may veto, and the kill switch is authoritative.
- **Surfaced by** [Experience Plane](./EXPERIENCE_PLANE.md): the journal, Portfolio Command, and Desk readiness strip; these display, never decide eligibility.
- **Shares** the counterfactual engine with [Scenario Intelligence](./SCENARIO_INTELLIGENCE.md).
- **Feeds back** `TradeRecord`s into [Research OS](./RESEARCH_OS.md) as trade-level evidence and lifecycle signals.
