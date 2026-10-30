# Context Deep-Dive — Data Foundation (Bounded Context #1)

Part of `docs/MASTER_DEVELOPMENT_PLAN.md` (Part II §5, context #1). Companion to the sibling context docs in this folder. Tags: **EXISTS / EXTEND / NEW / CONDITIONAL / DEFER**; evidence `[VERIFIED path:line]` (read 2026-10-22), `[DOC]`, `[PROPOSED]`.

> **One-line role:** the single source of trustworthy, point-in-time, versioned market data and features — everything downstream reads from here, and this context never expresses an opinion about trading.

---

## 1. Mission & boundary

**Owns.** All raw and derived *inputs* to the platform: broker/vendor connectors; ingestion of tick / bid-ask / OHLC / economic-event data; the candle store; the economic calendar; FX reference data (pip size, asset class, sessions); data-quality assessment; the **canonical market clock & point-in-time availability model**; dataset versioning/manifests; and (future) the shared **feature store**.

**Produces.** `MarketEvent`, `DatasetManifest`, `FeatureRecord` — all carrying data-quality + availability metadata.

**Explicitly does NOT own** (hard boundary — this is what keeps the platform honest):
- Any *interpretation* of the market — no trend/structure/regime calls (that is [Market Intelligence](./MARKET_INTELLIGENCE.md)).
- Any *trading recommendation, signal, or scenario* — ever.
- Cost/fill *modelling* for execution (that is [Safety / Execution](./SAFETY_EXECUTION.md)); Data Foundation supplies the raw bid/ask and spread *facts*, not the cost assumptions a backtest applies.
- The backtest/Judge/VAULT (that is [Research OS](./RESEARCH_OS.md)); it only serves them immutable, versioned datasets.

Boundary rule: *Data Foundation answers "what was true, and when was it knowable?" — nothing about "what to do."*

---

## 2. Current state (audited)

The context is **more built than a greenfield** — ingestion, QA, a manifest, gap detection and scheduling already exist — but the **point-in-time availability model and dataset versioning/provenance are absent**, which the whole platform depends on.

| Capability | Status | Evidence |
|---|---|---|
| OANDA connector w/ retry + circuit breaker | **EXISTS** | `[VERIFIED data/oanda_client.py:1-30]` (httpx + tenacity; practice/live hosts; `CircuitBreaker`) |
| M1 bid/ask ("MBA") + mid ingestion, 2-yr backfill, idempotent upsert | **EXISTS** | `[VERIFIED data/fetch_ohlcv.py:11-35]` (`PAIRS`=5 majors, `GRANULARITY="H1"`, `UPSERT … ON CONFLICT (pair,tf,ts)`) |
| TimescaleDB `candles` hypertable, identity `(pair,tf,ts)`, mid o/h/l/c + nullable bid/ask cols, `complete` flag | **EXISTS** | `[VERIFIED data/migrations/003_multi_timeframe.sql, 004_bidask.sql]` (mid stays o/h/l/c; `bid_*/ask_*` nullable; spread = `ask_c - bid_c`) |
| Multi-TF load: native M1/M5/M15/M30/H1, H4/D1 resampled from H1 | **EXISTS** | `[VERIFIED ta_engine/loader.py:6-22]` (`NATIVE_TF`, `DERIVED_TF`) — loader returns bid/ask too `[loader.py:30-38]` |
| Candle QA (dedupe / monotonic / gap / min-rows → PASS/FAIL) | **EXISTS (partial)** | `[VERIFIED data/qa.py:9-24]` (`_MIN_ROWS` per TF; status PASS/FAIL) |
| Dataset manifest (per instrument/TF: rows, start, end, qa, updated) | **EXISTS (proto)** | `[VERIFIED data/manifest.py:14-19]` + `data/manifest.json` |
| Ingestion-gap detection + `ingestion_gaps` table + FX-closed logic | **EXISTS** | `[VERIFIED data/validation.py:11-37]` |
| Scheduler (hourly poll, 4×/day calendar, daily gap check, startup backfill) | **EXISTS** | `[VERIFIED data/scheduler.py:15-27]` (APScheduler) |
| Instrument registry (pip/asset/session; Phase-2 metals/energy/bonds/indices/crosses pre-registered; TFs incl. D, W) | **EXISTS** | `[VERIFIED data/instruments.py:5-25]` |
| Economic calendar sync | **EXISTS** | `[VERIFIED data/fetch_calendar.py]` (`sync_calendar`, scheduled) |
| Pickle cache + exact cache-vs-DB equivalence proof | **EXISTS** | `[DOC SYSTEM_DOSSIER.md:87]` `engine/datacache.py` `verify_equiv` |
| API candle source (Protocol; PgSource/InMemory; serves **mid only**) | **EXISTS** | `[VERIFIED api/datasource.py:11-19]` (`COLS = ts,o,h,l,c,v` — no bid/ask over the wire) |
| **Point-in-time availability model** (eventTime/publishedAt/receivedAt/availableAt) | **MISSING** | `[VERIFIED grep data/ ta_engine/: none]` — only `ts` + a boolean `complete` exist |
| **Dataset versioning / immutable snapshots / provenance** | **MISSING** | manifest records current state only; no version id, no content hash, no snapshot lineage |
| **Data-quality scoring + quarantine** (beyond PASS/FAIL) | **PARTIAL** | `qa.py` is binary; no graded score, no quarantine lane |
| **Commission data**, multi-provider, cross-provider comparison | **MISSING** | cost is spread-only across the repo |
| **Shared feature store / registry** (indicators duplicated) | **MISSING** | `ta_engine/indicators.py:7` vs `forecast/features.py:23` compute the same indicators independently |

**Honest gaps that matter most:** (a) there is no way to ask "what was knowable at time *t*" other than the coarse `complete` flag; (b) a dataset cannot be *pinned by version* for a reproducible run; (c) the API does not serve bid/ask, so a frontend/`api`-sourced backtest cannot see the real spread the scalp engine uses.

---

## 3. Internal components / modules

| Component | Responsibility | Today | Target |
|---|---|---|---|
| **Connectors** (`data/oanda_client.py`, `data/fetch_ohlcv.py`, `data/fetch_calendar.py`) | Pull candles (MBA), calendar, with retry/circuit-breaker | EXISTS (OANDA only) | EXTEND: provider abstraction; stamp receipt/availability times |
| **Candle store** (`candles` hypertable, `data/db.py`) | Durable OHLC + bid/ask | EXISTS | EXTEND: availability columns; snapshot/version tagging |
| **Loader** (`ta_engine/loader.py`, `api/datasource.py`) | Serve native + resampled frames, causal windows | EXISTS | EXTEND: as-of filtering; serve bid/ask via API |
| **QA** (`data/qa.py`) | Pre-use integrity checks | EXISTS (PASS/FAIL) | EXTEND: graded quality score + quarantine |
| **Gap/validation** (`data/validation.py`) | Detect missing bars vs FX session calendar | EXISTS | EXTEND: feed quality score; surface to Ops Observatory |
| **Manifest** (`data/manifest.py`, `manifest.json`) | What data we have per (instrument, TF) | EXISTS (proto) | EVOLVE → `DatasetManifest` with version id + content hash + provenance |
| **Instrument registry** (`data/instruments.py`) | pip/point, asset class, session per symbol | EXISTS (incl. Phase-2) | EXTEND: data-rights/licensing flags per instrument |
| **Scheduler** (`data/scheduler.py`) | Poll / calendar / gap jobs | EXISTS | EXTEND: emit `dataset.ready` events (event-driven backbone) |
| **Market clock** (`core/market-clock`) | Canonical event/publish/receive/available model | **NEW** | the spine every downstream join uses |
| **Feature store** (`core/features`) | Versioned, point-in-time feature definitions | **NEW** | de-duplicate ATR/vol/swing/momentum across modules |

---

## 4. Owned records & contracts (field-level)

### `MarketEvent` (NEW — extends today's candle row)
```
MarketEvent {
  instrument: str                      # e.g. EUR_USD (data/instruments.py registry)
  tf: str                              # M1|M5|M15|M30|H1|H4|D|W
  eventTime: int                       # UTC seconds — when it happened in market time  (today: candles.ts)
  publishedAt: int                     # when the source published it (bar close / release time)   [NEW]
  receivedAt: int                      # when we received it from the provider                      [NEW]
  availableAt: int                     # when it became usable by a live system (the no-lookahead key) [NEW]
  kind: "candle" | "calendar" | "quote"
  mid: {o,h,l,c,v}                     # candles.o/h/l/c/v (mid)                       [VERIFIED 004_bidask.sql]
  bidask?: {bid_o..bid_c, ask_o..ask_c}# nullable, from price="MBA"                    [VERIFIED 004_bidask.sql]
  complete: bool                       # bar finality                                  [VERIFIED fetch_ohlcv UPSERT]
  dataVersion: str                     # snapshot/version id                            [NEW]
  quality: QualityScore                # see below                                      [NEW]
  provenance: {provider, request, ingestedBy}   # lineage                              [NEW]
}
```

### `DatasetManifest` (EVOLVE `data/manifest.py`)
```
DatasetManifest {
  datasetId: str; version: str; contentHash: str          # NEW: pin + reproduce
  instrument; tf; rows; start; end                         # EXISTS (manifest.json)
  qa: QualityScore                                         # EXTEND (today: "PASS"/"FAIL" string)
  immutable: bool; createdAt; supersedes?: version         # NEW: immutable snapshots + lineage
  provenance: {provider, fetchWindow, migrationLevel}      # NEW
}
```

### `FeatureRecord` (NEW — the feature store entry)
```
FeatureRecord {
  featureId: str; version: str                             # one versioned definition (fix duplication)
  instrument; tf; eventTime; availableAt                   # point-in-time
  value: number | object
  inputsHash: str; dependsOn: featureId[]                  # lineage for parity tests
}
```

### `QualityScore` (EXTEND `data/qa.py`)
```
QualityScore { status: "pass"|"degraded"|"quarantined"; score: 0..1;
               dups:int; monotonic:bool; max_gap_min:number; rows:int; reasons:[str] }
```

---

## 5. Interfaces — produces / consumes

| Direction | Counterparty | Contract / purpose |
|---|---|---|
| produces → | [Market Intelligence](./MARKET_INTELLIGENCE.md) | `MarketEvent` + quality + `availableAt`; causal candle frames for detectors |
| produces → | [Research OS](./RESEARCH_OS.md) | version-pinned `DatasetManifest` for reproducible runs (feeds `RunManifest`) |
| produces → | [Scenario Intelligence](./SCENARIO_INTELLIGENCE.md), [Safety / Execution](./SAFETY_EXECUTION.md) | bid/ask facts, calendar events w/ availability |
| produces → | [Experience Plane](./EXPERIENCE_PLANE.md) | candles via `GET /api/candles`/`/bounds` (today mid-only; EXTEND bid/ask) `[VERIFIED api/routes.py]` |
| produces → | all (event bus) | `dataset.ready`, `feed.degraded`, `calendar.synced` facts (NEW, durable queue) |
| consumes ← | OANDA v3 | M1 MBA candles, calendar `[VERIFIED data/oanda_client.py]` |
| consumes ← | (future) licensed feeds | options/order-book/macro (CONDITIONAL — see [Safety / Execution](./SAFETY_EXECUTION.md), §9) |

---

## 6. Guardrails & invariants
1. **No future leaks.** Every join is point-in-time: a consumer at as-of *t* sees only rows with `availableAt ≤ t`. The `complete` flag is necessary but not sufficient — the availability model (W0.2) is the real guarantee. (Non-negotiable rule #1 / #6.)
2. **Never publishes a recommendation.** Data Foundation emits facts and quality only; a trading opinion here would violate the context boundary.
3. **Degrade, never fabricate.** Missing options/order-book/volume/bid-ask ⇒ the feature is marked unavailable and downstream downgrades gracefully; the system never invents a value to fill a gap. (Acceptance test: "missing input".)
4. **Immutable, versioned datasets.** A published `DatasetManifest` version + content hash never changes; corrections create a new version that `supersedes` the old. Replay/exports read a pinned version. (Rule #6.)
5. **One definition per feature.** A feature has exactly one versioned definition in the feature store; modules must not re-implement ATR/volatility/swings/momentum with subtly different math.
6. **Quality is visible, not silent.** QA status rides with the data to the Ops & Data Observatory; stale/degraded feeds surface as P0 safety where they affect live decisions.

---

## 7. Phases that build it (from the Master Plan)

| Phase | Deliverable | Depends | Definition of Done | Test plan |
|---|---|---|---|---|
| **W0.2** | **Canonical market clock + point-in-time model** (`core/market-clock`, `core/data-quality`): add `eventTime/publishedAt/receivedAt/availableAt` + `dataVersion` to ingestion and the store; as-of filtering in the loader | W0.1 (decisions) | every ingested row carries the 4 times + version; loader can serve "as-of *t*" | no-future-leak unit test (as-of query hides later rows); existing `data/tests/*` green |
| **W0.3 (data side)** | Supply the one canonical cost basis's raw inputs (serve bid/ask via API; expose spread fact) + record source for `cost_model_version` | W0.2 | API serves bid/ask; spread derivable by consumers | API contract test for bid/ask fields |
| **W9.3** | **Feature Registry + point-in-time feature store** (`core/features`): one versioned definition per feature; migrate duplicated ATR/vol/swing/momentum (`ta_engine/indicators.py`, `forecast/features.py`, `desk/kernel`) behind it | W0.2 | a feature has one definition; cross-module parity | cross-module feature-parity tests (same value, same inputs) |
| **W9.3b (EXTEND)** | Evolve `manifest.py` → versioned `DatasetManifest` (content hash, immutable snapshots, provenance); emit `dataset.ready` events | W0.2 | runs pin a dataset version; manifest is append-only | manifest-immutability + reproduce-from-version test |
| **CONDITIONAL** | Multi-provider connectors + cross-provider price/spread comparison; licensed feeds behind graceful "unavailable" | OQ decisions 2,10 | second provider ingests behind the same contract | provider-parity + graceful-unavailable tests |

Guardrail on changes: extending the `candles` schema and `manifest.py` must keep existing ingestion + `verify_equiv` behaviour and the `data/tests` green (additive migrations, as 003/004 already demonstrate).

---

## 8. Context-specific acceptance tests
- **As-of equality:** a query at as-of *t* returns byte-identical candle/feature frames whether run live at *t* or reconstructed later; rows with `availableAt > t` are invisible.
- **Reproduce-from-version:** pinning a `DatasetManifest` version reproduces the exact frame months later, even after new data is ingested.
- **Graceful degradation:** with bid/ask or a licensed feed absent, consumers receive an explicit "unavailable" quality, never a fabricated number.
- **Quality visibility:** a feed with a gap over the FX session calendar is flagged (not silently filled) and surfaced to Ops. `[builds on data/validation.py]`
- **Feature parity:** the shared ATR definition returns identical values to the legacy `ta_engine`/`forecast` implementations on a golden fixture (before the duplicates are removed).
- **Immutability:** a manifest version, once published, cannot be mutated; a correction produces a new version that records `supersedes`.

---

## 9. Open decisions affecting this context
- **OQ-2 Data subscriptions** — broker-only FX vs licensed options/order-books/macro. Gates every CONDITIONAL institutional feature downstream (liquidity heatmap real book, options expiry/vol surface, market-impact). Recommended default: **broker-only (OANDA) first**, licensed feeds as optional plugins with graceful unavailable.
- **Decision 3 Instruments** — 5 majors (current ingest `PAIRS`) vs the broader set already *registered* in `data/instruments.py` (metals/energy/bonds/indices/crosses). Enabling them is mostly ingestion + QA, but multiplies data volume and cost.
- **Decision 10 Licensing & retention** — third-party feed contractual limits; how long raw snapshots are retained; this shapes `DatasetManifest` retention policy.
- **OQ-1 Cost model** — not owned here, but Data Foundation must serve whatever the chosen baseline needs (recommend serving real bid/ask so `scalp_engine`-parity is possible through the API).
- **Market-clock granularity** — do we model `publishedAt` distinct from `receivedAt` for candles (they nearly coincide at bar close) or only for calendar/releases where the gap is material? Recommend: full 4-time model for calendar/macro, `availableAt = bar close` for candles.

---

## 10. Code namespaces & tests to keep green
**Proposed namespaces:** `core/data-quality`, `core/market-clock`, `core/features`, `core/events` (planning names — extend the existing `data/` and `ta_engine/` packages rather than forking them).
**Existing packages to extend:** `data/` (connectors, store, QA, manifest, validation, scheduler, instruments), `ta_engine/loader.py`, `api/datasource.py`.
**Tests that must stay green:** `data/tests/*`, `ta_engine/tests/*`, `engine/tests/test_datacache.py` (needs the DB), `api/tests/test_api.py` (candle/bounds contract). Any schema migration is additive and idempotent (follow `003`/`004`).

---

## 11. Cross-context dependencies
- **Feeds everything.** Direct consumers: [Market Intelligence](./MARKET_INTELLIGENCE.md) (detectors, regime), [Research OS](./RESEARCH_OS.md) (reproducible datasets), [Scenario Intelligence](./SCENARIO_INTELLIGENCE.md), [Safety / Execution](./SAFETY_EXECUTION.md) (bid/ask facts), [Experience Plane](./EXPERIENCE_PLANE.md) (candles API).
- **Shared concern — features:** the feature store (W9.3) is co-owned in spirit with [Market Intelligence](./MARKET_INTELLIGENCE.md) and the regime engine, but the *definition registry + point-in-time store* live here; the *interpretation* lives there.
- **Hands off to [Safety / Execution](./SAFETY_EXECUTION.md):** raw bid/ask + spread facts; the cost/fill *model* that uses them is owned there, versioned as `cost_model_version`.
- **Upstream of the market clock:** W0.2 here is a prerequisite for the no-lookahead guarantees asserted in every other context (`viewAsOf`, replay parity, `RunManifest`).
