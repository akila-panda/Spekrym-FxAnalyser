"""Phase D validation: momentum vs pullback trigger, with MAE/MFE, per-fold
expectancy, and bootstrap CI — net of the real bid/ask spread.

Run: python -m research.scalp_validate [PAIR] [M1_LIMIT]
"""
import asyncio
import sys
import numpy as np
import pandas as pd

from ta_engine.loader import load_candles
from backtest.scalp_engine import run_scalp_backtest
from market_context.scalp_strategy import make_scalp_strategy, make_htf_provider

PAIR = sys.argv[1] if len(sys.argv) > 1 else "EUR_USD"
M1_LIMIT = int(sys.argv[2]) if len(sys.argv) > 2 else 200_000
PIP = 0.01 if PAIR.endswith("JPY") else 0.0001
N_FOLDS = 4


def _boot(x, iters=10000, seed=1):
    if len(x) < 5:
        return (float(np.mean(x)) if len(x) else 0.0, 0.0, 0.0, 1.0)
    rng = np.random.default_rng(seed)
    m = np.array([rng.choice(x, len(x), replace=True).mean() for _ in range(iters)])
    return (float(x.mean()), float(np.percentile(m, 2.5)), float(np.percentile(m, 97.5)),
            float((m <= 0).mean()))


def _mae_mfe(m1, trades):
    idx = {str(t): i for i, t in enumerate(pd.to_datetime(m1["ts"], utc=True))}
    bh, bl = m1["bid_h"].to_numpy(float), m1["bid_l"].to_numpy(float)
    ah, al = m1["ask_h"].to_numpy(float), m1["ask_l"].to_numpy(float)
    maes, mfes = [], []
    for t in trades:
        i0 = idx.get(t.entry_ts); i1 = idx.get(t.exit_ts)
        if i0 is None or i1 is None or i1 <= i0:
            continue
        if t.direction == "long":
            mfe = (bh[i0:i1 + 1].max() - t.entry) / PIP
            mae = (t.entry - bl[i0:i1 + 1].min()) / PIP
        else:
            mfe = (t.entry - al[i0:i1 + 1].min()) / PIP
            mae = (ah[i0:i1 + 1].max() - t.entry) / PIP
        maes.append(mae); mfes.append(mfe)
    return np.array(maes), np.array(mfes)


async def main():
    m1 = await load_candles(PAIR, "M1", limit=M1_LIMIT)
    m1 = m1.dropna(subset=["bid_c", "ask_c"]).reset_index(drop=True)
    frames = {"H1": await load_candles(PAIR, "H1", 4000),
              "H4": await load_candles(PAIR, "H4", 2000),
              "M15": await load_candles(PAIR, "M15", 8000),
              "M5": await load_candles(PAIR, "M5", 20000)}
    provider = make_htf_provider(frames)
    print(f"{PAIR} Phase D | M1 bars={len(m1)}\n")

    for trig in ("momentum", "pullback"):
        strat = make_scalp_strategy({"trigger": trig})
        res = run_scalp_backtest(m1, strat, PAIR, tp_pips=5, sl_pips=4,
                                 max_hold_min=45, max_spread_pips=1.8, htf_provider=provider)
        tr = res.trades
        if not tr:
            print(f"=== trigger={trig}: no trades ===\n"); continue
        pips = np.array([t.net_pips for t in tr])
        mean, lo, hi, p0 = _boot(pips)
        win = (pips > 0).mean()
        folds = np.array_split(pips, N_FOLDS)
        fold_exp = [f.mean() for f in folds if len(f)]
        fpos = np.mean([e > 0 for e in fold_exp]) if fold_exp else 0
        mae, mfe = _mae_mfe(m1, tr)
        flag = "EDGE" if (lo > 0 and fpos >= 0.75) else ""
        print(f"=== trigger={trig} ===")
        print(f"  n={len(tr)}  win={win:.3f}  avg_net_pips={mean:+.3f} "
              f"CI95=[{lo:+.2f},{hi:+.2f}]  P<=0={p0:.2f}  folds+={fpos:.0%}  {flag}")
        print(f"  per-fold avg pips: {[round(e, 2) for e in fold_exp]}")
        print("  exit mix: " + str({r: sum(1 for t in tr if t.exit_reason == r)
                                     for r in ('tp', 'sl', 'time', 'session_end')}))
        if len(mae):
            print(f"  MAE pips p50={np.median(mae):.1f} p90={np.percentile(mae, 90):.1f} | "
                  f"MFE pips p50={np.median(mfe):.1f} p90={np.percentile(mfe, 90):.1f}")
        print()


if __name__ == "__main__":
    asyncio.run(main())
