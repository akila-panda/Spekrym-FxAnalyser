"""Run the Phase C scalping strategy through the Phase B engine on EUR/USD M1.

Loads M1 (with bid/ask) for execution and H1/H4/M15/M5 for HTF context.
Run: python -m backtest.run_scalp [PAIR] [M1_LIMIT]
"""
import asyncio
import json
import sys

import pandas as pd

from ta_engine.loader import load_candles
from backtest.scalp_engine import run_scalp_backtest, summarize
from market_context.scalp_strategy import make_scalp_strategy, make_htf_provider

PAIR = sys.argv[1] if len(sys.argv) > 1 else "EUR_USD"
M1_LIMIT = int(sys.argv[2]) if len(sys.argv) > 2 else 200_000


async def main():
    m1 = await load_candles(PAIR, "M1", limit=M1_LIMIT)
    if m1.empty or m1["bid_c"].isna().all():
        print("no M1 bid/ask data — run the MBA backfill (Phase A) first."); return
    m1 = m1.dropna(subset=["bid_c", "ask_c"]).reset_index(drop=True)

    frames = {
        "H1": await load_candles(PAIR, "H1", limit=4000),
        "H4": await load_candles(PAIR, "H4", limit=2000),
        "M15": await load_candles(PAIR, "M15", limit=8000),
        "M5": await load_candles(PAIR, "M5", limit=20000),
    }
    provider = make_htf_provider(frames)
    strat = make_scalp_strategy()

    print(f"{PAIR} scalp backtest | M1 bars={len(m1)} "
          f"({m1['ts'].iloc[0]} -> {m1['ts'].iloc[-1]})")
    res = run_scalp_backtest(m1, strat, PAIR, tp_pips=5, sl_pips=4,
                             max_hold_min=45, max_spread_pips=1.8,
                             htf_provider=provider)
    s = summarize(res)
    print(json.dumps(s, indent=2))

    if res.trades:
        pd.DataFrame([t.__dict__ for t in res.trades]).to_csv("SCALP_TRADES.csv", index=False)
        print(f"wrote SCALP_TRADES.csv ({len(res.trades)} trades)")


if __name__ == "__main__":
    asyncio.run(main())
