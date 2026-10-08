# Spekrym-FX — Historical Data Acquisition Plan

Goal: give the system a complete, clean, multi-timeframe candle library so any
strategy (ORB, momentum, cross-sectional, relative-value, etc.) can be run across
many instruments — not just EUR/USD and NAS100. Build it in phases: **FX majors →
macro influencers — all OANDA-native (no synthetic indices, no futures).**

Timeframes per instrument: **M1, M5, M15, H1, H4, D, W**, **past 12 months**.

---

## 0. Current state (what already exists)

- **Store:** TimescaleDB `candles` hypertable with mid + bid/ask columns
  (`ts,o,h,l,c,v,bid_o/h/l/c,ask_o/h/l/c,pair,tf,complete`), migration `004_bidask`.
- **Fetch:** `data/fetch_ohlcv.py` → `backfill_pair(client, pair, tf, years, bidask)`
  (OANDA v3, paginates backward, `price="MBA"` for bid/ask). `OandaClient` handles
  rate limits / retries / circuit breaker.
- **Load:** `ta_engine/loader.py` (`NATIVE_TF={M1,M5,M15,M30,H1}`, resamples H4/D1).
- **Cache:** `engine/datacache.py` (per `(pair,tf,limit)` pickle, DB-equivalence tested).
- **Validation:** `data/validation.py`; scheduler `data/scheduler.py`.
- **Already loaded:** EUR_USD (full multi-TF incl. M1 bid/ask); NAS100_USD (~12mo M1).

So the pipeline exists — this plan **scales it to many instruments** and adds an
instrument registry, QA, and incremental updates.

---

## Design decisions (apply to every phase)

1. **Fetch each timeframe natively from OANDA** (it serves M1…W directly). Simplest
   and authoritative; high-TF fetches are tiny (W 12mo ≈ 52 bars). Avoids
   resampling ambiguity. (Loader keeps resample as a fallback only.)
2. **All timeframes = bid/ask (`MBA`)** — M1…W, so cost/execution realism is
   available at every timeframe, not just M1.
3. **Instrument registry** (new, small): per instrument — `pip`/point size, pip
   value, asset class (fx/metal/energy/index/bond), trading session/hours, OANDA
   symbol. The engine already accepts `pip`; the registry feeds it per instrument.
4. **Data manifest** (new): a table/file recording, per `(instrument,tf)`, the
   fetched range, row count, last-updated, and QA status — the source of truth for
   "what do we have."
5. **QA gate before use:** gap detection (missing sessions), duplicate/again check,
   DST/UTC sanity, min row-count. Nothing enters a backtest until it passes QA.
6. **Incremental updates:** after the one-time backfill, a daily `poll_latest`
   top-up keeps everything current (reuse `scheduler.py`).

---

## Phase 1 — Forex majors (first)

**Instruments (7 majors):** `EUR_USD, GBP_USD, USD_JPY, USD_CHF, AUD_USD,
USD_CAD, NZD_USD`. EUR_USD has M1 (bid/ask) + M5/M15/H1 (mid only); under the
all-bid/ask rule it needs **M5/M15/H1 re-fetched as bid/ask** and native
**H4/D/W (bid/ask)** added (M1 already has it). (+ top-up to current.)

**Execution: ONE pair at a time** (not all 6 at once) — avoids OANDA rate-limit
collisions and keeps each fetch verifiable. For each pair: backfill all 7 TFs
(M1 bid/ask + M5/M15/H1/H4/D/W mid), QA, record manifest, report, then STOP and
wait for the next pair. Order: EUR_USD (M5/M15/H1 bid/ask + H4/D/W), GBP_USD,
USD_JPY, USD_CHF, AUD_USD, USD_CAD, NZD_USD.

**Steps (per pair)**
1. **1.1 Registry + manifest scaffolding** — done (`data/instruments.py`,
   `data/manifest.py`, `data/qa.py`).
2. **1.2 Backfill one pair, all 7 TFs, 12mo — all bid/ask** (M1 heavy ~15–25 min;
   higher TFs minutes).
3. **1.3 QA each `(pair,tf)`** — dup/monotonic/gap/count; record status in manifest.
4. **1.4 Report + STOP**; on "next", do the following pair.
5. **1.5 Cache warm** (after all majors) — build datacache pickles for research.

**Acceptance:** every `(major, tf)` present for 12mo, QA-passed, manifest-logged,
loadable via `load_candles` / `load_split_cached`. Spot-check EUR_USD parity.

---

## Phase 2 — Macro influencers (OANDA-native)

Rationale: the cross-asset / different-information directions (the project's
highest-EV research lane) need risk/rates/commodity context alongside the dollar
pairs from Phase 1.

**Instruments (OANDA-available):**
- **Metals:** `XAU_USD` (gold), `XAG_USD` (silver)
- **Energy:** `BCO_USD` (Brent), `WTICO_USD` (WTI)
- **Rates (yield CFDs):** `USB10Y_USD`, `USB02Y_USD` (and `DE10YB_EUR` if useful)
- **Equity indices:** `SPX500_USD`, `US30_USD`, `DE30_EUR`, `UK100_GBP`, `JP225_USD`
  (NAS100_USD already done)

The dollar's influence is covered directly by the Phase-1 USD pairs; no synthetic
dollar index is built.

**Steps:** same 1.2–1.5 pattern (M1 bid/ask + higher-TF mid, QA, cache).
Optionally add a few crosses (`EUR_GBP`, `EUR_JPY`) for relative-value work.

**Acceptance:** metals/energy/rates/indices loaded + QA-passed and loadable like
any Phase-1 instrument.

---

## Cross-cutting (every phase)

- **Instrument registry** — single source for pip/point, pip value, session, asset
  class; feeds the engine's `pip` and session gates per instrument.
- **Data QA** — gap report (expected vs present bars per session), duplicate
  removal, monotonic-ts check, DST/UTC audit, rollover-spike flagging.
- **Manifest** — `(instrument,tf) → range, rows, last_update, qa_status`.
- **Caching** — datacache pickles per `(instrument,tf,limit)`; vault discipline
  unchanged (research splits still TRAIN/VALID/VAULT per instrument).
- **Incremental sync** — daily `poll_latest` top-up; weekly full QA sweep.
- **Storage/perf** — all-TF bid/ask across ~15 instruments × 12mo ≈ several million
  rows (bid/ask ~doubles width); ensure the hypertable index on `(pair,tf,ts)` is
  present; measured load times feed the cache decision.

---

## Build order & rough effort

| Phase | Scope | Heavy cost | Est. wall-clock |
|---|---|---|---|
| 0 | registry + manifest + QA scaffolding | code | ~0.5 day |
| 1 | 7 FX majors × 7 TFs, 12mo | 6× M1 backfills | ~2–3 h fetch + 0.5 day code |
| 2 | metals/energy/rates/indices | ~10 M1 backfills | ~3–4 h fetch + 0.5 day |

Fetching is background/sequential and resumable; the one-time M1 backfills are the
only long poles. Higher timeframes are trivial.

---

## Risks / honest limits

- **Scope is OANDA-native only** — no futures and no synthetic/real DXY in this
  plan (both removed by decision). Everything here is directly fetchable from OANDA.
- **M1 12-month backfills are slow** (~650 requests/pair) — hours in aggregate;
  run backgrounded, resumable, rate-limit-aware.
- **Weekend/holiday gaps & DST** differ by asset class (FX ~24×5, indices have
  cash-session gaps, metals/energy their own) — the QA gap-check must be
  session-aware per instrument, not one-size-fits-all.
- **Scope creep** — "all candle data" is large; the manifest + QA gate keep it
  honest (we only *use* what has passed QA).

---

## Immediate next step (on your go)
Phase 0 done. Phase 1 runs **one pair per "next"**: EUR_USD first (M5/M15/H1 as
bid/ask + H4/D/W), then GBP_USD (all 7 TFs bid/ask) → QA → manifest → report →
STOP, and so on through NZD_USD.
