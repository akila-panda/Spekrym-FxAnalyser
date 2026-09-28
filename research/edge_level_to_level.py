"""Level-to-level edge test: entry -> nearest unswept liquidity target, stop
beyond the invalidation swing (structurally-defined, variable R:R).

Why this is a clean test: with target distance `reward` and stop distance
`risk`, a random walk hits the target before the stop with probability
risk/(risk+reward), which makes expected R exactly 0 *before costs*. So the null
is 0 — any positive net expectancy after costs is real evidence that price
reaches structural targets more often than geometry implies. No arbitrary
break-even to argue about.

Setups (causal, one per qualifying bar):
  long  : target = nearest UNSWEPT buy-side pool above; stop = last swing low below
  short : target = nearest UNSWEPT sell-side pool below; stop = last swing high above
Only taken when R:R is in a sane band; then optionally filtered by confluence.

Run: python -m research.edge_level_to_level [PAIR]
"""
import asyncio
import sys
import numpy as np
import pandas as pd

from ta_engine.loader import load_candles
from ta_engine.support_resistance import find_swing_points
from market_context.liquidity import liquidity_pools

PAIR = sys.argv[1] if len(sys.argv) > 1 else "EUR_USD"
TF = sys.argv[2] if len(sys.argv) > 2 else "H1"
LIMIT = 15000
WINDOW = 250
HORIZON = 240
ATR_N = 14
RR_MIN, RR_MAX = 0.5, 8.0
STOP_BUF = 0.1
PD_LOOKBACK = 90
SPREAD_PIP, SLIP_PIP, PIP = 0.6, 0.1, 0.0001
N_FOLDS = 5
WARM = WINDOW + 1


def _boot(x, iters=10000, seed=1):
    if len(x) == 0:
        return (0.0, 0.0, 0.0, 1.0)
    rng = np.random.default_rng(seed)
    m = np.array([rng.choice(x, len(x), replace=True).mean() for _ in range(iters)])
    return (float(x.mean()), float(np.percentile(m, 2.5)), float(np.percentile(m, 97.5)),
            float((m <= 0).mean()))


async def main():
    df = await load_candles(PAIR, TF, limit=LIMIT)
    print(f"timeframe={TF}")
    o = df["o"].to_numpy(float); h = df["h"].to_numpy(float)
    l = df["l"].to_numpy(float); c = df["c"].to_numpy(float)
    n = len(df)

    tr = np.maximum(h - l, np.maximum(np.abs(h - np.roll(c, 1)), np.abs(l - np.roll(c, 1))))
    atr = pd.Series(tr).rolling(ATR_N).mean().to_numpy()
    roll_hi = pd.Series(h).rolling(PD_LOOKBACK).max().to_numpy()
    roll_lo = pd.Series(l).rolling(PD_LOOKBACK).min().to_numpy()
    pd_pct = (c - roll_lo) / (roll_hi - roll_lo)
    zone = np.where(pd_pct > 0.52, "premium", np.where(pd_pct < 0.48, "discount", "equilibrium"))
    cost_price = (SPREAD_PIP / 2 + SLIP_PIP) * PIP * 2

    rows = []
    for i in range(WARM, n - 1):
        a = atr[i]
        if not np.isfinite(a) or a <= 0:
            continue
        win = df.iloc[i - WINDOW:i + 1]
        highs, lows = find_swing_points(win, order=3)
        if not highs or not lows:
            continue
        pools = liquidity_pools(win, order=2, lookback=WINDOW, min_touches=2)
        entry = o[i + 1]

        for direction in ("long", "short"):
            if direction == "long":
                tgs = [p["level"] for p in pools["buy_side"] if not p["swept"] and p["level"] > entry]
                sws = [s["price"] for s in lows if s["price"] < entry]
                if not tgs or not sws:
                    continue
                target = min(tgs); stop = max(sws) - STOP_BUF * a
                risk = entry - stop; reward = target - entry
            else:
                tgs = [p["level"] for p in pools["sell_side"] if not p["swept"] and p["level"] < entry]
                sws = [s["price"] for s in highs if s["price"] > entry]
                if not tgs or not sws:
                    continue
                target = max(tgs); stop = min(sws) + STOP_BUF * a
                risk = stop - entry; reward = entry - target
            if risk <= 0 or reward <= 0:
                continue
            rr = reward / risk
            if rr < RR_MIN or rr > RR_MAX:
                continue

            outcome = 0
            for j in range(i + 1, min(i + 1 + HORIZON, n)):
                if direction == "long":
                    hit_sl = l[j] <= stop; hit_tp = h[j] >= target
                else:
                    hit_sl = h[j] >= stop; hit_tp = l[j] <= target
                if hit_sl and hit_tp:
                    outcome = -1; break
                if hit_sl:
                    outcome = -1; break
                if hit_tp:
                    outcome = 1; break
            if outcome == 0:
                continue
            gross = rr if outcome == 1 else -1.0
            net = gross - cost_price / risk
            fair_p = risk / (risk + reward)
            rows.append({"dir": direction, "tp_first": outcome == 1, "rr": rr,
                         "fair_p": fair_p, "net_R": net, "zone": zone[i],
                         "fold": min(N_FOLDS - 1, int((i - WARM) / ((n - WARM) / N_FOLDS)))})

    t = pd.DataFrame(rows)
    t.to_csv("EDGE_LEVEL_TO_LEVEL.csv", index=False)
    print(f"{PAIR}: {len(t)} level-to-level setups resolved\n")
    if t.empty:
        return

    def report(name, sub):
        if len(sub) < 30:
            print(f"  {name:34} n={len(sub):5d}  (too few)"); return
        realized = sub["tp_first"].mean()
        fair = sub["fair_p"].mean()
        mean, lo, hi, p0 = _boot(sub["net_R"].to_numpy())
        fpos = (sub.groupby("fold")["net_R"].mean() > 0).mean()
        flag = "EDGE" if (lo > 0 and fpos >= 0.8) else ""
        print(f"  {name:34} n={len(sub):5d}  hit={realized:.3f} vs fair={fair:.3f}  "
              f"expR={mean:+.4f} [{lo:+.3f},{hi:+.3f}]  P<=0={p0:.2f}  folds+={fpos:.0%}  {flag}")

    print("OVERALL (null expectancy = 0 before costs)")
    report("all setups", t)
    report("all long", t[t.dir == "long"])
    report("all short", t[t.dir == "short"])

    print("\nBY PREMIUM/DISCOUNT ALIGNMENT")
    report("long @ discount", t[(t.dir == "long") & (t.zone == "discount")])
    report("short @ premium", t[(t.dir == "short") & (t.zone == "premium")])

    print("\nMEAN R:R:", round(t["rr"].mean(), 2), "| overall tp-first:", round(t["tp_first"].mean(), 3))


if __name__ == "__main__":
    asyncio.run(main())
