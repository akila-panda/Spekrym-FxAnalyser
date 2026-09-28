# SCALP — Phase A: Data & Cost Realism

**Goal:** get real 1-minute data *with the true bid/ask spread* into the DB, and
measure the actual spread you would pay by session. Everything downstream is
meaningless without this — a 5-pip target lives or dies on a ~1-pip spread.

**Depends on:** existing data layer (`data/`), TimescaleDB, multi-tf schema
(migration 003 added the `tf` column).

---

## Why this is first
0.01 lot EUR/USD → 1 pip = $0.10, so $0.50 = 5 pips, $1 = 10 pips. A mid-price
backtest hides the spread you cross. We must model **bid/ask**, not mid.

## Tasks
- [ ] **A1. Extend the OANDA client to fetch bid+ask.** `data/oanda_client.py`
  `get_candles(..., price="BA")` — OANDA returns each candle with `bid` and `ask`
  dicts (each `o/h/l/c`) instead of `mid`. Add a parser path for BA.
- [ ] **A2. Schema for bid/ask.** New migration `004_bidask.sql`: add nullable
  columns to `candles`:
  `bid_o, bid_h, bid_l, bid_c, ask_o, ask_h, ask_l, ask_c DOUBLE PRECISION`.
  (Keep existing mid `o/h/l/c` = midpoint. Spread at any bar = `ask_c - bid_c`.)
- [ ] **A3. Ingestion for M1 + bid/ask.** In `data/fetch_ohlcv.py`, add a
  `price="BA"` path: `_to_row_ba(pair, candle, tf)` filling bid_*/ask_* and mid
  = (bid+ask)/2; UPSERT includes the new columns. Backfill **M1** (and refresh
  M5/M15) for EUR_USD first (2y ≈ ~740k M1 bars; paginate 5000/req).
- [ ] **A4. Loader passthrough.** `ta_engine/loader.py` returns bid/ask columns
  when present (add to the SELECT), so the scalp engine (Phase B) can use them.
- [ ] **A5. Spread measurement.** `research/spread_profile.py`: from stored M1
  bid/ask, compute spread = ask_c − bid_c in pips, grouped by UTC hour and by
  session (London 07–16, NY 12–21, off-session). Report median, p90, p99.

## Deliverables
- `data/migrations/004_bidask.sql`, updated `oanda_client.py` / `fetch_ohlcv.py` / `loader.py`.
- `research/spread_profile.py` + printed spread-by-hour table.

## Exit criteria (must all be true)
1. EUR_USD **M1 bid/ask** stored for ≥ 2 years; row count sane (~700k+).
2. Spread-by-session table produced; we know the **median and p90 spread in
   London and NY** in pips (this is the number Phase D tests against).
3. `load_candles("EUR_USD","M1")` returns bid/ask columns populated.

## Reality notes
- OANDA **practice** spreads are often tighter than a real retail account —
  treat measured spread as a *floor*; Phase D stresses it upward.
- If M1 bid/ask history from OANDA is limited, fetch the maximum available and
  note the true window; do not fabricate spread.
