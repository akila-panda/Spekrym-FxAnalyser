# Spekrym-FX — Architecture Decision Log

**Status:** ✅ CONFIRMED 2026-10-22 — all 12 recommended defaults accepted as written (no overrides). Wave 0.1 is unblocked. **Date:** 2026-10-22.
**Purpose:** resolve the open decisions that gate `docs/MASTER_DEVELOPMENT_PLAN.md` **Wave 0.1** before any sequencing. Nothing downstream is scheduled until these are settled.

**How to use.** Each decision has a **recommended default** (my pick), why, what would change it, what it gates, and a **Decision** line. Leave the Decision line as *"Proposed default (unconfirmed)"* to accept it, or replace it with your choice. These are reversible planning choices, not code — change them freely as the picture sharpens.

**Decision source key:** `BP§14-n` = Unified Blueprint open decision n · `OQ-n` = `docs/INTEGRATION_DESIGN.md` open question.

---

## Quick reference — the twelve defaults

| ID | Decision | Recommended default |
|---|---|---|
| D1 (OQ-1) | Canonical cost model | `scalp_engine` real bid/ask; others become diagnostics |
| D2 (OQ-2) | Baseline / reference line | Fair/random-entry null net of cost — not a champion strategy |
| D3 (BP§14-1) | Target users | Single expert discretionary trader (you), designed to not preclude a team later |
| D4 (BP§14-2) | Data subscriptions | Broker-only (OANDA) first; licensed feeds as optional, graceful-unavailable plugins |
| D5 (BP§14-3) | Instruments | 5 majors live now; Phase-2 set (metals/indices/bonds/crosses) registered, enabled on demand |
| D6 (BP§14-4) | Authority level | Decision-support + shadow-only; live execution deferred behind separate authorization |
| D7 (BP§14-5) | Execution environments | Local Mac dev + deployable workers; deterministic, content-addressed artifacts |
| D8 (BP§14-6) | Sharing | Local prefs stay local; plans/decisions/snapshots get durable storage + opt-in sync |
| D9 (BP§14-7) | Visual design | Reuse existing theme tokens first; design-system overhaul as a later coordinated pass |
| D10 (BP§14-8) | Regime forecasts | Deterministic/qualitative descriptors first; probabilities only after validated calibration |
| D11 (BP§14-9) | Research controls / authority ownership | Human-only VAULT + live promotion; Judge config change-controlled + logged |
| D12 (BP§14-10) | Licensing & retention | Retain source docs + model outputs; honor feed contractual limits; document per-feed |

---

## D1 (OQ-1) — Canonical cost model
**Question.** Three inconsistent cost models exist — `backtest/scalp_engine.py` (real bid/ask), `backtest/engine.py` (modeled 0.6/0.1 + optional commission, default 0), scanner `api/strategies/orb.py` (flat 1.6). Which is *the* baseline every strategy is scored on?
**Recommended default.** **`scalp_engine` real bid/ask** as the one canonical basis; the other two become *diagnostic references only*. Add `cost_model_version` to every engine output, `RunManifest`, and `TradeRecord`. Make commission/slippage explicit even if 0 for OANDA.
**Why.** It is the most realistic (spread paid in the fill, pessimistic SL-before-TP), it is what the Judge is already built on, and the repo's conclusions were reached under it. One comparable basis is a prerequisite for cross-strategy verdicts.
**What would change it.** If the product is explicitly an H1 *mid-price* day-trading system, standardize on `engine.py` with explicit 0.6/0.1 instead.
**Gates.** Wave **W0.3**; [Safety / Execution](./contexts/SAFETY_EXECUTION.md), [Research OS](./contexts/RESEARCH_OS.md). **Blocks comparability of everything.**
**Decision:** ✅ CONFIRMED 2026-10-22 — recommended default accepted.

## D2 (OQ-2) — Baseline / reference line
**Question.** Now that the platform is strategy-agnostic, what does every new strategy get compared against?
**Recommended default.** The **fair/random-entry null net of cost** the Judge already computes (`stop/(stop+target)` vs cost-adjusted break-even) — **not** any one "champion" strategy. Keep OBE as a worked *negative* example in the ledger.
**Why.** A factory needs a neutral, comparable "no-edge" line; anchoring on a strategy (especially OBE, which is "No edge") would bias the whole programme. The plan's quoted "43% win rate" has no source in the repo.
**What would change it.** If you want a specific validated champion as the reference within a strategy *family*, freeze that one via `freeze_spec` and compare within the family.
**Gates.** Wave **W0.3/W1.4**; [Research OS](./contexts/RESEARCH_OS.md), [Strategy / Trade / Portfolio](./contexts/STRATEGY_TRADE_PORTFOLIO.md).
**Decision:** ✅ CONFIRMED 2026-10-22 — recommended default accepted.

## D3 (BP§14-1) — Target users
**Question.** Single expert discretionary trader, or a multi-user research team? Sets the permission model.
**Recommended default.** **Single expert discretionary trader (you)** as the primary user, but build the authorization/audit layer (`AuthorizationDecision`) so a multi-user team is a later addition, not a rewrite.
**Why.** It matches current reality and keeps the permission model simple now, while the server-side authorization records (needed anyway for VAULT/live) make multi-user additive.
**What would change it.** A near-term team/collaborator need pulls role-based permissions + shared artifacts forward (interacts with D8).
**Gates.** [Experience Plane](./contexts/EXPERIENCE_PLANE.md) (UI roles), [Safety / Execution](./contexts/SAFETY_EXECUTION.md) + [Research OS](./contexts/RESEARCH_OS.md) (authorization).
**Decision:** ✅ CONFIRMED 2026-10-22 — recommended default accepted.

## D4 (BP§14-2) — Data subscriptions
**Question.** Broker-only FX, or licensed options / order-book / macro feeds?
**Recommended default.** **Broker-only (OANDA) first.** All institutional-inspired features that need premium data (liquidity heatmap real book, options expiry/barriers, vol surface, L3/L4 execution fidelity, market-impact) are built **CONDITIONAL**, as optional plugins with an explicit graceful "unavailable" state — never faked.
**Why.** Keeps cost and complexity down; the repo's whole discipline is "degrade, never fabricate"; most high-value work doesn't need licensed feeds yet.
**What would change it.** Evidence that a specific licensed feed carries durable, cost-surviving signal (empirically, via the Judge) justifies subscribing.
**Gates.** [Data Foundation](./contexts/DATA_FOUNDATION.md) connectors; every CONDITIONAL feature across [Market Intelligence](./contexts/MARKET_INTELLIGENCE.md) + [Safety / Execution](./contexts/SAFETY_EXECUTION.md).
**Decision:** ✅ CONFIRMED 2026-10-22 — recommended default accepted.

## D5 (BP§14-3) — Instruments
**Question.** Stay on the 5 majors, or broaden to metals/indices/bonds/crosses?
**Recommended default.** **5 majors live now** (current ingest `PAIRS`); keep the **Phase-2 set already registered** in `data/instruments.py` (XAU/XAG, BCO/WTICO, USB10Y/USB02Y, SPX500/US30/DE30/UK100/JP225/NAS100, EUR_GBP/EUR_JPY) **registered but not ingested** until a concrete need (RELAY cross-asset, relative-strength, portfolio currency exposure) pulls them in.
**Why.** Broadening multiplies data volume, QA, and cost; the registry already supports it, so enabling is cheap when justified. Relative-strength + portfolio exposure math only become meaningful with the broader set.
**What would change it.** Committing to RELAY cross-asset research or a multi-instrument portfolio moves metals/indices ingestion earlier.
**Gates.** [Data Foundation](./contexts/DATA_FOUNDATION.md) ingest; [Market Intelligence](./contexts/MARKET_INTELLIGENCE.md) (relative strength), [Strategy / Trade / Portfolio](./contexts/STRATEGY_TRADE_PORTFOLIO.md) (exposure), RELAY.
**Decision:** ✅ CONFIRMED 2026-10-22 — recommended default accepted.

## D6 (BP§14-4) — Authority level
**Question.** Decision-support only, shadow-only automation, or authorized live execution?
**Recommended default.** **Decision-support + shadow-only.** Live execution (`W8.3` broker adapter / micro-live) stays **DEFER**, reachable only after the kill switch + hard limits exist (W8.1) and a *separate, explicit human authorization*.
**Why.** There is currently no safety layer and no proven edge; shadow mode delivers all the learning value with none of the capital risk. Live is a deliberate, gated step, not a default.
**What would change it.** A strategy reaching `vault_confirmed` *and* passing forward/shadow validation, with the safety layer built, justifies considering micro-live.
**Gates.** [Safety / Execution](./contexts/SAFETY_EXECUTION.md) (W8.x), [Strategy / Trade / Portfolio](./contexts/STRATEGY_TRADE_PORTFOLIO.md) (selector).
**Decision:** ✅ CONFIRMED 2026-10-22 — recommended default accepted.

## D7 (BP§14-5) — Execution environments
**Question.** Where do research jobs run, and how are they packaged deterministically?
**Recommended default.** **Local Mac dev + deployable workers**, with the DAG/compute layer producing **deterministic, content-addressed artifacts** (via `RunManifest`) that reproduce across environments.
**Why.** Matches current local setup (venv + Docker Timescale) while the manifest + content-addressing make "runs the same on a worker" a design property, not a hope.
**What would change it.** Needing large-scale parallel search (Wave 9.5 distributed compute) earlier pulls the worker/queue infrastructure forward.
**Gates.** [Research OS](./contexts/RESEARCH_OS.md) (workflow DAG, artifacts, compute).
**Decision:** ✅ CONFIRMED 2026-10-22 — recommended default accepted.

## D8 (BP§14-6) — Sharing / replication
**Question.** Stay local-only, or synchronize plans/decision artifacts?
**Recommended default.** **Personal UI prefs stay local** (the existing DESK convention); **immutable plans, decisions, evidence snapshots, and review records get durable storage + opt-in sync.** Nothing new joins the cross-window sync bus unless two windows must share a live selection.
**Why.** Preserves the clean state-classification discipline while making the records that *matter long-term* (and feed research) durable. Matches the blueprint's "reconsider the blanket never-replicate rule" for durable artifacts only.
**What would change it.** A multi-user/team decision (D3) makes shared artifacts mandatory, not optional.
**Gates.** [Experience Plane](./contexts/EXPERIENCE_PLANE.md) (state classification), [Strategy / Trade / Portfolio](./contexts/STRATEGY_TRADE_PORTFOLIO.md) (durable `TradeRecord`s).
**Decision:** ✅ CONFIRMED 2026-10-22 — recommended default accepted.

## D9 (BP§14-7) — Visual design
**Question.** Reuse existing theme tokens, or do a design-system overhaul?
**Recommended default.** **Reuse the existing `--role-*` theme tokens** (the annotation adapter already enforces "no new colours"); treat a design-system overhaul as a **later, coordinated pass** across Scan/Desk/Relay/Research once the Intelligence Canvas exists.
**Why.** Keeps the Canvas build additive and fast; a system-wide restyle is cheaper and more coherent after the new surfaces are in place.
**What would change it.** If a distinct visual identity is a near-term product goal, front-load a token/design-system definition before the Canvas.
**Gates.** [Visual Intelligence](./contexts/VISUAL_INTELLIGENCE.md), [Experience Plane](./contexts/EXPERIENCE_PLANE.md).
**Decision:** ✅ CONFIRMED 2026-10-22 — recommended default accepted.

## D10 (BP§14-8) — Regime forecasts
**Question.** Deterministic descriptors first, or statistical probabilities?
**Recommended default.** **Deterministic / qualitative descriptors first** (rule-based `RegimeSnapshot`, Category-B scenarios). Statistical probabilities (HMM/change-point for regime; the `forecast/` model for Category-C) are surfaced **only after validated, calibrated evaluation** via the Judge + Calibration Monitor.
**Why.** The repo's #1 rule — no fabricated probabilities; a model (e.g. the existing forecast at ~0.43 accuracy, not significant) must earn the right to emit numbers.
**What would change it.** Regime diagnostics (W3.2) + calibration showing a model is genuinely calibrated OOS promotes it to a numeric source.
**Gates.** [Market Intelligence](./contexts/MARKET_INTELLIGENCE.md) (regime), [Scenario Intelligence](./contexts/SCENARIO_INTELLIGENCE.md) (Category C), [Research OS](./contexts/RESEARCH_OS.md) (model registry).
**Decision:** ✅ CONFIRMED 2026-10-22 — recommended default accepted.

## D11 (BP§14-9) — Research controls / authority ownership
**Question.** Who owns the approval workflow, Judge settings, and VAULT access?
**Recommended default.** **Human-only authorization** for VAULT confirmation and live promotion (server-side `AuthorizationDecision`, audited). Judge configuration is **change-controlled and logged** (a config change is itself a recorded event); the Master Brain can propose but never alter gates or reach the VAULT.
**Why.** This is the integrity backbone — "referee before players", the Judge as sole verdict authority, holdout protection. These must be the hardest guarantees in the system.
**What would change it.** Nothing short-term; even autonomous research (Wave 6) keeps human authorization for VAULT/live.
**Gates.** [Research OS](./contexts/RESEARCH_OS.md), [Safety / Execution](./contexts/SAFETY_EXECUTION.md).
**Decision:** ✅ CONFIRMED 2026-10-22 — recommended default accepted.

## D12 (BP§14-10) — Licensing & retention
**Question.** Third-party feed contractual limits; retention of source documents and model outputs?
**Recommended default.** **Retain source docs + model/LLM outputs** as part of `RunManifest`/provenance (reproducibility needs them); **honor each feed's contractual limits** and record per-feed retention/redistribution rules in the instrument/dataset registry before enabling any licensed feed.
**Why.** Reproducibility and audit require keeping what produced a result; licensing compliance is a hard external constraint that must be explicit per feed, not assumed.
**What would change it.** A specific licensed feed's terms may forbid storage/redistribution, constraining what can be retained or shown.
**Gates.** [Data Foundation](./contexts/DATA_FOUNDATION.md) (dataset provenance/retention), [Research OS](./contexts/RESEARCH_OS.md) (manifests).
**Decision:** ✅ CONFIRMED 2026-10-22 — recommended default accepted.

---

## Dependencies between decisions
- **D1 → everything comparable.** Until the cost model is fixed, no cross-strategy result is meaningful. Settle first.
- **D4 ↔ D5 ↔ D12** — data breadth, licensing, and retention move together; broader instruments or licensed feeds pull D12 forward.
- **D3 ↔ D8** — multi-user makes shared artifacts mandatory.
- **D6 ↔ D11 ↔ Safety** — authority level and research controls both route through the server-side `AuthorizationDecision` + the (unbuilt) kill switch; live is gated on both.
- **D10 ↔ D2** — "no fabricated probabilities" and "the reference is a null, not a strategy" are the same honesty stance applied to regimes and to baselines.

## Confirmation
✅ **Confirmed 2026-10-22.** All twelve recommended defaults were accepted as written — no overrides — so no changes were needed in `MASTER_DEVELOPMENT_PLAN.md` or the context docs (they already assume these defaults). Wave 0.1 is resolved; the build may proceed frontend-first from **F0** (`FRONTEND_PHASES.md`), with **D1** (cost model = `scalp_engine` real bid/ask) already settled for backend B0b.

Locked choices: D1 bid/ask cost model · D2 fair/random reference line · D3 single expert · D4 broker-only first · D5 5 majors live · D6 shadow-only (live deferred) · D7 local + workers · D8 local prefs, durable plans/decisions/snapshots · D9 reuse tokens · D10 deterministic regime first · D11 human-only VAULT/live · D12 retain source+outputs, honor feed limits.
