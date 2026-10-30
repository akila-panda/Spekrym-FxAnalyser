# Context Deep-Dive — Safety / Execution (Bounded Context #6)

Part of `docs/MASTER_DEVELOPMENT_PLAN.md` (Part II §5, context #6). Companion to the sibling context docs. Tags: **EXISTS / EXTEND / NEW / CONDITIONAL / DEFER**; evidence `[VERIFIED path:line]` (read 2026-10-22), `[DOC]`, `[PROPOSED]`.

> **One-line role:** the authoritative, backend-enforced gatekeeper for anything that could move money — one canonical cost/fill model, hard risk limits with a kill switch, shadow before live, and order state. It can veto everything else; nothing can bypass it.

---

## 1. Mission & boundary

**Owns.** The canonical cost & fill assumptions (one model, versioned); broker connectivity; order state; operational guardrails (kill switch, daily-loss, max-drawdown, exposure cap); shadow-mode monitoring; and the execution-fidelity simulator.

**Produces.** The versioned `CostModel`/`FillModel`, `OrderState`, `SafetyVeto`, and `AuthorizationDecision` (for live-affecting actions). Owns live execution eligibility and the operational state surface.

**Explicitly does NOT own:**
- *Which* strategy to run — that is [Strategy / Trade / Portfolio](./STRATEGY_TRADE_PORTFOLIO.md); this context receives an `EligibilityDecision` + proposed sizing and may veto/execute it.
- *Whether an edge is real* — that is [Research OS](./RESEARCH_OS.md); but this context supplies the cost model experiments run on, versioned.
- *Research proposing/automation* — the **Master Brain is separate from and subordinate to** this context; no proposal or LLM action can place an order or lift a limit.

Boundary rule: *Safety / Execution answers "is it safe and authorized to act, at what realistic cost, and what is the order's state?" — and its veto beats everything.*

---

## 2. Current state (audited)

The cost/fill *primitives* and three (inconsistent) cost models exist; the **safety layer is almost entirely absent** — the biggest risk gap in the whole platform.

| Capability | Status | Evidence |
|---|---|---|
| Realistic bid/ask fills (BUY ask / SELL bid, spread baked), session + spread + time gates, SL-before-TP intrabar | **EXISTS** | `[VERIFIED backtest/scalp_engine.py:1-5, 76-82, 129-138]` (`max_spread_pips=1.5`, sessions, `slippage_pips=0.0`) |
| `ScalpTrade` record (exit_reason tp/sl/time/session_end, spread_at_entry) | **EXISTS** | `[VERIFIED backtest/scalp_engine.py:32-44]` |
| Mid-price engine w/ modeled half-spread + slippage + **commission param (default 0.0)** | **EXISTS** | `[VERIFIED backtest/engine.py:68-70, 89, 107-112, 137]` |
| Scanner flat cost `net = gross − 1.6` | **EXISTS** | `[VERIFIED api/strategies/orb.py:17, 197]` |
| Position sizing / ATR stops / RR targets / account-ccy conversion | **EXISTS** | `risk/{position_sizing,stops,currency}.py` |
| Correlation-exposure **warning** (0.7) — warns, does not block | **EXISTS (partial)** | `risk/correlation.py` |
| **Canonical single cost model + `cost_model_version`** | **MISSING** | three models disagree (bid/ask vs 0.6/0.1 vs flat 1.6) |
| **Kill switch / circuit breaker** | **MISSING** | `[VERIFIED grep risk/ agents/ engine/: none]` |
| **Daily-loss limit / max-drawdown cap / exposure cap (blocking)** | **MISSING** | only a non-blocking correlation warning exists |
| **Broker execution adapter / order state machine** | **MISSING** | — |
| **Shadow mode engine** (live inputs, hypothetical fills, no orders) | **MISSING** | `agents/service.py` logs recommendations but no shadow-fill model |
| **Paper-trading module** | **MISSING** | `[VERIFIED paper_trading/README.md]` = "Purpose: TBD" |
| **Execution Simulation Laboratory** (fidelity L1–L4) | **MISSING** | fidelity is implicit per engine |

**Honest anchor:** there is currently **no way to stop live trading**, because there is no live trading and no safety layer. Before *any* execution capability is built, the kill switch + hard limits (W8.1) must exist and be backend-enforced. Commission is modelled only in `engine.py` (and defaults to 0); the chosen canonical model must make the commission/spread/slippage story explicit and single.

---

## 3. Internal components / modules

| Component | Responsibility | Today | Target |
|---|---|---|---|
| **Canonical cost/fill model** (`trading/execution` cost core) | One versioned spread/slippage/commission + fill model all engines use | EXISTS ×3 (inconsistent) | unify → `cost_model_version` everywhere |
| **Risk primitives** (`risk/`) | Sizing, stops, currency conversion, correlation | EXISTS | feed the stateful safety module |
| **Stateful Safety module** (`trading/risk` safety core) | Kill switch, daily-loss, max-DD, exposure cap; backend-enforced vetoes | **NEW** | authoritative; server-side |
| **Shadow-mode engine** | Live inputs → logged proposed selections + hypothetical fills; no orders | **NEW** | simulated-vs-observed distinction |
| **Broker adapter + order state** | Connectivity; order lifecycle; reconciliation | **NEW (DEFER)** | gated behind explicit authorization |
| **Execution Simulation Laboratory** | Fidelity L1 candle / L2 bid-ask / L3 tick / L4 stress; label fill assumptions | **NEW** | fair comparison at one fidelity |
| **Market Impact Monitor** | Thin-liquidity / spread-spike / price-sensitivity windows | **NEW (CONDITIONAL)** | retail feed = partial proxy |

---

## 4. Owned records & contracts (field-level)

### `CostModel` / `FillModel` (EXTEND — unify the three into one versioned model)
```
CostModel {
  cost_model_version: str                 # recorded in every RunManifest + TradeRecord
  basis: "bid_ask" | "modeled_spread"     # recommend bid_ask (scalp_engine) as canonical
  spread_source: "data_bidask" | "flat_pips"
  slippage_pips; commission_per_trade; swaps?    # explicit, not implied
  fill_rule: "sl_before_tp_intrabar"      # pessimistic (as scalp_engine) [scalp_engine.py:129-138]
  fidelityLevel: 1|2|3|4
  assumptionsLabel: str                   # stated when depth/tick data is unavailable
}
```

### `SafetyLimits` + `SafetyVeto` (NEW)
```
SafetyLimits { killSwitch: bool; dailyLossLimit; maxDrawdownPct; exposureCap;
               perTradeRiskPct; sessionExposureCap }
SafetyVeto   { at; scope: trade|strategy|portfolio|global; limit; observed; reason; actor="safety" }
```
Invariant: a `SafetyVeto` overrides any `EligibilityDecision`; the kill switch halts all execution regardless of source.

### `OrderState` (NEW — DEFER)
```
OrderState { orderId; strategy_id; strategy_version; instrument; intended; filled?;
             status: queued|submitted|partial|filled|rejected|cancelled;
             slippageObserved; reconciliationRef }
```

### `AuthorizationDecision` (NEW — the server-side gate for live-affecting actions)
```
AuthorizationDecision { actor; action; permission; source+version; timestamp; rationale }
```
Covers: VAULT access (delegated to [Research OS](./RESEARCH_OS.md)), promotion to live eligibility, raising risk limits, enabling autonomous research privileges — all server-side, audited.

---

## 5. Interfaces — produces / consumes

| Direction | Counterparty | Contract / purpose |
|---|---|---|
| consumes ← | [Strategy / Trade / Portfolio](./STRATEGY_TRADE_PORTFOLIO.md) | `EligibilityDecision` + proposed sizing → veto or execute |
| consumes ← | [Data Foundation](./DATA_FOUNDATION.md) | real bid/ask + spread facts for the canonical cost model; live inputs for shadow |
| produces → | [Research OS](./RESEARCH_OS.md) | the canonical `CostModel` + `cost_model_version` that experiments run on |
| produces → | [Experience Plane](./EXPERIENCE_PLANE.md) | risk strip (P0 safety), shadow results, Ops & Data Observatory operational state |
| produces → | all | `SafetyVeto`, kill-switch state (P0, always visible) |
| authorizes | live-affecting actions | `AuthorizationDecision` (server-side) |

---

## 6. Guardrails & invariants
1. **The veto beats everything.** A `SafetyVeto` or the kill switch overrides any selection, scenario, LLM proposal, workflow, query, or overlay. (Rule #3.)
2. **No bypass.** Live selection/risk cannot be bypassed by Desk, the Master Brain, a workflow, a query, or the overlay layer; limits are enforced server-side. (Integration acceptance test.)
3. **Kill switch before live.** No execution capability ships before the kill switch + hard limits exist and are tested. Micro-live is **DEFER** and requires separate, explicit human authorization.
4. **One canonical cost model.** All engines score on one `cost_model_version`; the other models become diagnostics only. Recording the version in every run/trade makes drift visible. (OQ-1.)
5. **Label fill assumptions; never fabricate depth.** When order-book/tick data is absent, the simulator states its assumptions rather than pretending to reconstruct real liquidity.
6. **Separate from the Brain.** This context is independent of and authoritative over the Master Brain; a research or LLM action can never place an order or lift a limit.
7. **Shadow distinguishes simulated vs observed fills**, so shadow results are never mistaken for real execution.

---

## 7. Phases that build it (from the Master Plan)

| Phase | Deliverable | Depends | Definition of Done | Test plan |
|---|---|---|---|---|
| **W0.3** | **Unify the cost model** + add `cost_model_version` to all engine outputs; pick the canonical basis (recommend `scalp_engine` bid/ask); make commission/spread/slippage explicit | W0.1 | one cost basis; version recorded everywhere | `engine/tests/test_golden.py` + `backtest/tests/*` reproduce known numbers; version-recorded test |
| **W8.1** | **Stateful Risk/Safety module**: kill switch, daily-loss, max-DD, exposure cap; backend-enforced veto | W0.4 | limits enforced in a sim harness; veto overrides eligibility | limit-enforcement + veto-precedence tests |
| **W8.2** | **Shadow mode**: live inputs, logged proposed selections + hypothetical fills, simulated-vs-observed; no orders | W8.1, [Strategy / Trade / Portfolio](./STRATEGY_TRADE_PORTFOLIO.md) W7.1 | shadow runs end-to-end; no order path reachable | "no order path reachable" test; simulated-vs-observed labelling test |
| **W8.3 (DEFER)** | **Broker adapter + micro-live** (0.01 lot) — only after separate human authorization | W8.2 | gated behind `AuthorizationDecision` + kill switch; reconciliation | reconciliation + kill-switch drill |
| **W9.1** | **Execution Simulation Laboratory** (fidelity L1 candle / L2 bid-ask / L3 tick / L4 stress); label assumptions when no depth | W0.3 | a strategy compared at one fidelity level | fidelity-parity tests |
| **CONDITIONAL** | **Market Impact Monitor** (thin-liquidity/spread-spike windows) | OQ-2 data | windows surfaced where feed supports | proxy-labelling test |

---

## 8. Context-specific acceptance tests
- **Veto precedence:** a `SafetyVeto`/kill switch overrides an otherwise-eligible selection; the order never proceeds.
- **No bypass:** no path through Desk/Brain/workflow/query/overlay can place an order or raise a limit without a server-side `AuthorizationDecision`.
- **Cost reproducibility:** after unification, golden P&L fixtures still reproduce exactly; every run/trade carries `cost_model_version`.
- **Shadow safety:** in shadow mode, there is provably no reachable order path; fills are labelled simulated.
- **Fidelity honesty:** with no depth data, the simulator labels its fill assumptions rather than inventing a fill.
- **Kill-switch drill:** triggering the kill switch halts all (simulated) execution immediately and is audited.

---

## 9. Open decisions affecting this context
- **Decision 4 Authority** — decision-support vs shadow-only vs authorized live execution. This is *the* decision that sizes this context. Recommended: **shadow-only until explicitly authorized**; W8.3 stays deferred.
- **OQ-1 Cost model** — which canonical basis. Recommended: `scalp_engine` real bid/ask; others diagnostic.
- **Decision 2 Data subscriptions** — Market Impact Monitor + L3/L4 fidelity need richer feeds (CONDITIONAL).
- **Decision 9 Research controls / authorization ownership** — who holds the authority to lift limits, promote to live, enable autonomy. Recommended: **human-only, audited**.
- **Broker + account** — practice vs live OANDA account, lot sizing, and whether micro-live is ever in scope (ties to Decision 4).

---

## 10. Code namespaces & tests to keep green
**Proposed namespaces:** `trading/{execution,risk}` (the safety/execution core) + the canonical cost model shared with [Research OS](./RESEARCH_OS.md).
**Existing to extend:** `backtest/scalp_engine.py`, `backtest/engine.py`, `api/strategies/orb.py` (converge their cost logic), `risk/*`, `paper_trading/` (currently empty → shadow mode).
**Tests that must stay green:** `backtest/tests/{test_scalp_engine,test_engine,test_risk,test_currency}.py` and `engine/tests/test_golden.py` (the cost-model unification must not change the hand-computed numbers). New safety tests are additive.

---

## 11. Cross-context dependencies
- **Receives** `EligibilityDecision` + sizing from [Strategy / Trade / Portfolio](./STRATEGY_TRADE_PORTFOLIO.md); returns a veto or an execution.
- **Supplies** the canonical `CostModel`/`cost_model_version` to [Research OS](./RESEARCH_OS.md) (experiments) and consumes real bid/ask from [Data Foundation](./DATA_FOUNDATION.md).
- **Surfaces** P0 safety state (kill switch, limit breaches, stale-feed impact) to [Experience Plane](./EXPERIENCE_PLANE.md) — always visible, never suppressible by personal visibility controls.
- **Authoritative over** the Master Brain and every other context for anything live-affecting; holds the server-side `AuthorizationDecision` gate (VAULT access is delegated to [Research OS](./RESEARCH_OS.md)'s `load_vault`).
- **Blocks** the whole platform's live ambitions until W8.1 exists — the kill switch is a prerequisite, not a finishing touch.
