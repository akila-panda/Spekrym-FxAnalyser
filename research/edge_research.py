"""Edge research: conditional probability of TP-before-SL given confluences.

No model is trained here, so there is nothing to overfit — we measure the
*empirical* frequency of a fixed 2:1 (ATR stop / 2R target) trade reaching TP
before SL, conditioned on causal market-context confluences, with realistic
costs, per direction. A confluence "has edge" only if it lifts net expectancy
above zero AND holds across time folds (guarding against regime luck).

Baseline: a 2:1 trade needs > 33.3% TP-first just to break even before costs.

Run: python -m research.edge_research [PAIR]
"""
import asyncio
import sys
import numpy as np
import pandas as pd

from ta_engine.loader import load_candles

PAIR = sys.argv[1] if len(sys.argv) > 1 else "EUR_USD"
TF = sys.argv[2] if len(sys.argv) > 2 else "H1"
LIMIT = 15000
ATR_N = 14
RR = 2.0
ATR_MULT = 1.0
HORIZON = 120          # max bars to resolve a trade (~5 trading days H1)
PD_LOOKBACK = 90
SPREAD_PIP, SLIP_PIP, PIP = 0.6, 0.1, 0.0001
N_FOLDS = 5


def _session(h):
    return np.where((h >= 7) & (h < 12), "london",
           np.where((h >= 12) & (h < 16), "overlap",
           np.where((h >= 16) & (h < 20), "ny",
           np.where((h >= 20) | (h < 0), "late", "asia"))))


def _wilson(k, n, z=1.96):
    if n == 0:
        return (0.0, 0.0)
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    hh = z * np.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (c - hh, c + hh)


async def main():
    df = await load_candles(PAIR, TF, limit=LIMIT)
    print(f"timeframe={TF}")
    o = df["o"].to_numpy(float); h = df["h"].to_numpy(float)
    l = df["l"].to_numpy(float); c = df["c"].to_numpy(float)
    ts = pd.to_datetime(df["ts"], utc=True)
    n = len(df)

    tr = np.maximum(h - l, np.maximum(np.abs(h - np.roll(c, 1)), np.abs(l - np.roll(c, 1))))
    atr = pd.Series(tr).rolling(ATR_N).mean().to_numpy()
    body_atr = np.abs(c - o) / atr
    disp = body_atr >= 1.5
    disp_dir = np.where(c > o, "up", "down")

    sma50 = pd.Series(c).rolling(50).mean().to_numpy()
    sma50_prev = np.roll(sma50, 5)
    trend = np.where((c > sma50) & (sma50 > sma50_prev), "bull",
            np.where((c < sma50) & (sma50 < sma50_prev), "bear", "range"))

    roll_hi = pd.Series(h).rolling(PD_LOOKBACK).max().to_numpy()
    roll_lo = pd.Series(l).rolling(PD_LOOKBACK).min().to_numpy()
    pd_pct = (c - roll_lo) / (roll_hi - roll_lo)
    zone = np.where(pd_pct > 0.52, "premium", np.where(pd_pct < 0.48, "discount", "equilibrium"))

    hour = ts.dt.hour.to_numpy()
    sess = _session(hour)

    cost_price = (SPREAD_PIP / 2 + SLIP_PIP) * PIP * 2  # round trip in price

    rows = []
    warm = max(ATR_N, 50, PD_LOOKBACK) + 1
    for i in range(warm, n - 1):
        a = atr[i]
        if not np.isfinite(a) or a <= 0:
            continue
        entry = o[i + 1]
        risk = a * ATR_MULT
        for direction in ("long", "short"):
            if direction == "long":
                sl, tp = entry - risk, entry + RR * risk
            else:
                sl, tp = entry + risk, entry - RR * risk
            outcome = 0
            for j in range(i + 1, min(i + 1 + HORIZON, n)):
                if direction == "long":
                    hit_sl = l[j] <= sl; hit_tp = h[j] >= tp
                else:
                    hit_sl = h[j] >= sl; hit_tp = l[j] <= tp
                if hit_sl and hit_tp:
                    outcome = -1; break
                if hit_sl:
                    outcome = -1; break
                if hit_tp:
                    outcome = 1; break
            if outcome == 0:
                continue
            gross = RR if outcome == 1 else -1.0
            net = gross - cost_price / risk
            rows.append({"i": i, "dir": direction, "tp_first": outcome == 1, "net_R": net,
                         "trend": trend[i], "zone": zone[i], "sess": sess[i],
                         "disp": bool(disp[i]), "disp_dir": disp_dir[i],
                         "fold": min(N_FOLDS - 1, int((i - warm) / ((n - warm) / N_FOLDS)))})
    t = pd.DataFrame(rows)
    t.to_csv("EDGE_RESEARCH.csv", index=False)
    print(f"{PAIR}: {len(t)} resolved hypothetical trades\n")

    def report(name, sub):
        if len(sub) < 30:
            print(f"  {name:38} n={len(sub):5d}  (too few)"); return
        tpr = sub["tp_first"].mean()
        lo, hi = _wilson(int(sub["tp_first"].sum()), len(sub))
        exp = sub["net_R"].mean()
        fpos = (sub.groupby("fold")["net_R"].mean() > 0).mean()
        flag = "EDGE" if (lo > 0.36 and exp > 0 and fpos >= 0.8) else ""
        print(f"  {name:38} n={len(sub):5d}  TPfirst={tpr:.3f} [{lo:.3f},{hi:.3f}]  "
              f"expR={exp:+.4f}  folds+={fpos:.0%}  {flag}")

    print("BASELINE")
    for d in ("long", "short"):
        report(f"all {d}", t[t.dir == d])

    print("\nBY PREMIUM/DISCOUNT (directional logic)")
    report("long @ discount", t[(t.dir == "long") & (t.zone == "discount")])
    report("short @ premium", t[(t.dir == "short") & (t.zone == "premium")])
    report("long @ premium (counter)", t[(t.dir == "long") & (t.zone == "premium")])
    report("short @ discount (counter)", t[(t.dir == "short") & (t.zone == "discount")])

    print("\nBY TREND ALIGNMENT")
    report("long @ bull trend", t[(t.dir == "long") & (t.trend == "bull")])
    report("short @ bear trend", t[(t.dir == "short") & (t.trend == "bear")])

    print("\nBY DISPLACEMENT (with direction)")
    report("long @ disp up", t[(t.dir == "long") & (t.disp) & (t.disp_dir == "up")])
    report("short @ disp down", t[(t.dir == "short") & (t.disp) & (t.disp_dir == "down")])

    print("\nCONFLUENCE STACK")
    report("long: bull+discount+dispUp",
           t[(t.dir == "long") & (t.trend == "bull") & (t.zone == "discount") & (t.disp) & (t.disp_dir == "up")])
    report("short: bear+premium+dispDn",
           t[(t.dir == "short") & (t.trend == "bear") & (t.zone == "premium") & (t.disp) & (t.disp_dir == "down")])

    print("\nBY SESSION (long)")
    for s in ("london", "overlap", "ny", "asia", "late"):
        report(f"long @ {s}", t[(t.dir == "long") & (t.sess == s)])


if __name__ == "__main__":
    asyncio.run(main())
