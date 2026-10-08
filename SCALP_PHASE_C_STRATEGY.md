# SCALP — Phase C: Strategy (HTF trend → M5 setup → M1 trigger)  (CRITICAL)

**Goal:** a concrete, fully-specified, testable scalping strategy that plugs into
the Phase B engine. Trade *with* the higher-timeframe trend, into a discount/
premium location, off a real M5 zone, triggered by a 1-minute confirmation.
Every rule below maps to a function that already exists in `market_context/`.

**Depends on:** Phase B (`scalp_engine`), `market_context/` (all detectors),
`ta_engine/loader`.

---

## 1. The idea in one line
In an H1/H4 uptrend, wait for price to pull back into a **discount** M5 demand
zone (FVG or unswept sell-side liquidity), then buy on a **1-minute bullish
confirmation** for a small fixed target. Shorts are the mirror.

## 2. The decision cascade (evaluated per M1 bar, in session only)

**Step 1 — HTF trend gate (refreshed hourly, not per minute):**
```
from market_context.structure import market_structure
h4 = market_structure(load H4)   ; h1 = market_structure(load H1)
bias = "long"  if h1.trend=="bullish" and h4.trend in ("bullish","range")
       "short" if h1.trend=="bearish" and h4.trend in ("bearish","range")
       else None   # no trade when HTF conflicts
```

**Step 2 — Location gate (premium/discount on M15):**
```
from market_context.premium_discount import premium_discount
pd = premium_discount(load M15, lookback=96)     # ~24h of M15
long  allowed only if pd.zone in ("discount","equilibrium")   # buy cheap
short allowed only if pd.zone in ("premium","equilibrium")
```

**Step 3 — Setup zone (M5): an unmitigated demand/supply object near price:**
```
from market_context.imbalance import active_fvgs
from market_context.liquidity import liquidity_pools
long  zone = a bullish M5 FVG below price, OR a swept sell-side pool (stop-run)
short zone = a bearish M5 FVG above price, OR a swept buy-side pool
"near price" = price within zone_atr * ATR(M5) of the zone.
```

**Step 4 — M1 entry trigger (the actual entry condition):**
```
from market_context.structure import market_structure      # on M1
from market_context.displacement import displacement        # on M1
Enter LONG when, inside/just above the zone:
   (a) M1 makes a micro bullish BOS (close breaks last M1 swing high), OR
   (b) M1 displacement up (body/ATR >= 1.5) in the zone.
Enter SHORT: mirror.
```

**Step 5 — Risk/target:**
```
SL: fixed sl_pips (default 4), OR just beyond the zone / M1 swing low
    (whichever is further from entry, capped at sl_pips_max=8).
TP: fixed tp_pips (default 5).      # your "quick small profit"
    Variant to test: TP = nearest opposite liquidity pool (structure target).
```

## 3. Strategy factory (plugs into Phase B engine)
```python
def make_scalp_strategy(pair, cfg) -> StrategyFn:
    def strategy_fn(ctx):
        # ctx.k, ctx.m1 (causal slice), ctx.htf (refreshed hourly by engine)
        bias = ctx.htf["bias"]                                   # Step 1 (cached)
        if bias is None: return None
        if not _location_ok(ctx.htf["pd_zone"], bias): return None   # Step 2
        zone = _nearest_zone(ctx.htf["zones"], ctx.price, bias)      # Step 3
        if zone is None: return None
        if not _m1_trigger(ctx.m1, bias): return None               # Step 4
        return {"direction": bias, "sl_pips": cfg.sl_pips, "tp_pips": cfg.tp_pips,
                "reason": f"{bias}:{zone['type']}"}                  # Step 5
    return strategy_fn
```
The engine (Phase B §3/§5) computes HTF context **once per hour** and passes it in
via `ctx.htf`, so we don't recompute H1/H4/M15 every minute (huge speedup, still
causal — HTF only updates on completed HTF bars).

## 4. Default parameters (starting hypothesis — NOT optimized)
```
tp_pips=5, sl_pips=4, sl_pips_max=8, zone_atr=0.5,
htf=("H4","H1"), location_tf="M15", zone_tf="M5", trigger_tf="M1",
sessions=London+NY, max_hold_min=45, max_spread_pips=1.2
```
Tuned only by economic sense. Phase D discovers sensible values from MAE/MFE
distributions; it does not grid-search the best-looking curve.

## 5. Confluence scoring (optional selectivity)
Each passed gate = +1 confluence; require min_confluence (e.g. 3) to trade. Log
the confluence set per trade so Phase D can measure `P(win | confluence set)` and
find which confluences add value vs which just cut frequency.

## 6. Guardrails (from prior findings)
- Not predicting direction with the ML model (proven no tradable edge).
- Not stacking so many confluences that frequency collapses (we saw n=2–4).
- Not trusting mid-price fills — Phase B uses bid/ask.
- Nothing is "profitable" until Phase D clears it after real spread.

## 7. Exit criteria
1. `market_context/scalp_strategy.py` implements `make_scalp_strategy` using the
   real detector functions above.
2. Runs end-to-end through the Phase B engine on EUR_USD M1; 10 sampled trades
   inspect as genuine with-trend pullback entries (chart-verified).
3. Unit tests per gate (`market_context/tests/test_scalp_strategy.py`): trend gate
   blocks counter-trend, location gate blocks premium-longs, trigger fires only on
   M1 BOS/displacement.

## 8. Reality note (read this)
Prior evidence (M5 confluence + level-to-level) found **hit rate = fair rate** —
these confluences carried no directional information at M5, and cost worsened at
finer TF. This M1 strategy is a genuinely new, more selective, session- and
spread-filtered test, so it deserves one honest run — but the base-rate
expectation is negative net expectancy in Phase D. If it is negative, that is the
answer; we do not tune until it looks green.
