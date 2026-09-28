# SCALP — Phase B: 1-Minute Scalping Execution Engine  (CRITICAL)

**Goal:** a causal M1 backtest engine that fills at the **real bid/ask**, uses
fixed small pip targets, trades only in-session, sizes at 0.01 lot, and reports
net-of-spread P&L in pips, R, and dollars. This is the truth machine — every
strategy in Phase C is scored by it.

**Depends on:** Phase A (M1 bid/ask in DB), `risk/` (sizing), `ta_engine/loader`.

---

## 1. Build a NEW engine, do not overload the H1 engine
File: `backtest/scalp_engine.py`. The existing `backtest/engine.py` assumes
mid-price + ATR structure; scalping needs bid/ask fills and fixed pips. Keep them
separate.

## 2. Bid/ask fill model (the core correctness point)
You **buy at the ask, sell at the bid** — you always pay the spread.
```
pip = 0.01 if pair endswith JPY else 0.0001
LONG:
  entry = ask_open[k+1]                      # buy the ask at next bar open
  tp    = entry + tp_pips*pip
  sl    = entry - sl_pips*pip
  exit scans bars j> k+1 on the BID (you sell at bid):
      hit_tp when bid_high[j] >= tp
      hit_sl when bid_low[j]  <= sl
SHORT:
  entry = bid_open[k+1]                      # sell the bid
  tp    = entry - tp_pips*pip
  sl    = entry + sl_pips*pip
  exit scans on the ASK (you buy back at ask):
      hit_tp when ask_low[j]  <= tp
      hit_sl when ask_high[j] >= sl
```
If a bar hits both SL and TP, count **SL** (pessimistic — M1 is the finest
granularity we have). This bakes the round-trip spread into P&L — do NOT subtract
spread again.

## 3. Signal interface (Phase C plugs in here)
```python
StrategyFn = Callable[[Ctx], Optional[dict]]
# returns None, or {"direction": "long"|"short",
#                   "sl_pips": float, "tp_pips": float,  # optional per-signal
#                   "reason": str}
```
`Ctx` = lightweight per-bar object: index `k`, the causal M1 slice up to `k`, and
a hook to per-hour HTF context (refreshed hourly by the engine so Phase C doesn't
recompute HTF every minute — see Phase C section 5).

## 4. Engine signature
```python
def run_scalp_backtest(
    m1: pd.DataFrame,            # M1 with bid_/ask_ OHLC + ts (ascending)
    strategy_fn: StrategyFn,
    pair: str,
    tp_pips: float = 5.0,
    sl_pips: float = 4.0,
    lot: float = 0.01,           # 0.01 lot = 1000 units
    sessions=(("07:00","16:00"),("12:00","21:00")),  # UTC London, NY
    max_hold_min: int = 45,      # time stop
    max_spread_pips: float = 1.5,# skip entries when spread too wide
    one_position: bool = True,
    account_ccy: str = "USD",
) -> ScalpResult
```

## 5. Rules the engine enforces
- **Session gate:** only *open* trades when `ts` (UTC) is inside a session window.
  Open trades may exit anytime; force-close at end of the last daily session
  (`close_at_session_end=True`).
- **Spread gate:** skip a signal if `(ask_c - bid_c)/pip > max_spread_pips` at the
  signal bar.
- **Time stop:** if neither SL nor TP hit within `max_hold_min`, close at current
  bid (long) / ask (short).
- **One position at a time** first (simplest, honest); an N-concurrent variant can
  come later.

## 6. P&L math (0.01 lot)
```
units         = lot * 100_000                  # 0.01 -> 1000 units
value_per_pip = units * pip                     # 1000 * 0.0001 = $0.10 (EURUSD)
move_pips     = (exit - entry)/pip * (+1 long / -1 short)
pnl_quote     = move_pips * pip * units
pnl_usd       = quote_to_account(pnl_quote, pair, exit_price)   # risk/currency.py
R             = pnl_usd / (sl_pips * value_per_pip)
```
Fills already use bid/ask, so `pnl_usd` is net of spread. Add optional
`commission_per_trade` / `swap` for a commission account.

## 7. Metrics (`ScalpResult` + report)
Per trade: entry_ts, exit_ts, dir, entry, exit, exit_reason(tp/sl/time),
move_pips, net_pips, pnl_usd, R, hold_min, session, spread_at_entry.
Aggregate: n, **trades/day**, win%, avg win/loss pips, **net expectancy in pips
AND $ (THE number)**, profit factor, maxDD ($ and R), max losing streak,
avg hold, $/day, exposure.

## 8. Exit criteria
1. Engine replays EUR_USD M1 with bid/ask fills, per-trade log with net-of-spread P&L.
2. **Acceptance test:** an "always-long, tp=sl=5" strategy yields expectancy ≈
   **−(spread in pips)** per trade (proves spread is paid exactly once round-trip).
3. Session + spread + time-stop gates covered by unit tests
   (`backtest/tests/test_scalp_engine.py`).

## 9. Reality notes
- The always-long sanity check is the acceptance test: if it isn't ≈ minus-one-
  spread, the fill model is wrong and every later result is a lie.
- M1 over 2y is ~740k bars — forward-scan bounded by `max_hold` keeps it fast.
