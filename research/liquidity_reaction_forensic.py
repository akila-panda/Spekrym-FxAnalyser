"""Track 1 — Liquidity-Reaction Forensic (READ-ONLY, TRAIN only, exploratory).

Research question
-----------------
When EUR/USD penetrates a causally defined prior price level and subsequently
*reclaims* it, does the reclaimed-break event carry directional information over
subsequent intraday horizons that differs from the unconditional baseline and
from ordinary / accepted breaks?

This is exploratory TRAIN-only evidence. It is NOT a strategy, NOT a Judge
PASS/FAIL experiment, and it never touches VALIDATION or VAULT or the ledger.
It reports effect sizes + day-aware bootstrap CIs, not significance verdicts.

Causality notes
---------------
- market_context/levels.py is causal (PDH/PDL & session H/L from COMPLETED prior
  periods). Reused directly (precomputed per-day for speed).
- ta_engine/support_resistance.find_swing_points is a CENTERED fractal: a swing at
  bar i uses `order` candles on BOTH sides, so it is only knowable at bar i+order.
  Using it as "known at bar i" would be look-ahead. We therefore apply an explicit
  `order`-bar confirmation delay: a swing level is active only from i+order onward.

Price-proxy limitation
---------------------
These are PRICE-DEFINED liquidity proxies from M1 OHLC/bid-ask. They are NOT
observations of dealer liquidity, order-book depth, or true FX order flow.

Fixed definitions (chosen once, documented, NOT optimized/swept):
  penetration threshold = 1.0 pip beyond the level
  reclaim window        = 30 M1 bars after the break
  swing order           = 2  (confirmation delay = 2 bars)
  swing active window   = 480 M1 bars after confirmation
  forward horizons      = 5, 15, 30, 60, 120 minutes
  cost (round-trip)     = 1.6 pips (project's measured EUR/USD spread)
  one event per (level) = first break only (debounce)

Run: python -m research.liquidity_reaction_forensic
"""
import asyncio

import numpy as np
import pandas as pd

from engine.datacache import load_split_cached
from ta_engine.support_resistance import find_swing_points

PAIR, PIP = "EUR_USD", 0.0001
PEN = 1.0            # penetration threshold (pips)
RECLAIM_WIN = 30     # bars to reclaim
SWING_ORDER = 2
SWING_ACTIVE = 480
HORIZONS = [5, 15, 30, 60, 120]
COST = 1.6
RNG = np.random.default_rng(7)


def _day_bootstrap(vals, days, iters=4000):
    """Day-aware bootstrap CI for the mean (resample unique days, not events,
    because events in the same day are not independent)."""
    vals = np.asarray(vals, float)
    days = np.asarray(days)
    if len(vals) < 5:
        return (float(vals.mean()) if len(vals) else 0.0, float("nan"), float("nan"))
    uniq = np.unique(days)
    by = {d: vals[days == d] for d in uniq}
    means = np.empty(iters)
    for i in range(iters):
        pick = RNG.choice(uniq, len(uniq), replace=True)
        means[i] = np.concatenate([by[d] for d in pick]).mean()
    return (float(vals.mean()), float(np.percentile(means, 2.5)),
            float(np.percentile(means, 97.5)))


def main_sync(df):
    ts = pd.to_datetime(df["ts"], utc=True)
    h = df["h"].to_numpy(float); l = df["l"].to_numpy(float); c = df["c"].to_numpy(float)
    day_id = ts.dt.strftime("%Y-%m-%d").to_numpy()
    hour = ts.dt.hour.to_numpy()
    n = len(df)
    pen = PEN * PIP

    # ---- per-day high/low (PDH/PDL) and per-day session H/L (causal: prior day) ----
    daydf = pd.DataFrame({"day": day_id, "h": h, "l": l, "hour": hour,
                          "idx": np.arange(n)})
    days_sorted = list(dict.fromkeys(day_id))       # chronological unique days
    day_hl = daydf.groupby("day").agg(h=("h", "max"), l=("l", "min"))
    first_idx = daydf.groupby("day")["idx"].min().to_dict()
    last_idx = daydf.groupby("day")["idx"].max().to_dict()

    def sess_hl(day, lo, hi):
        m = (daydf["day"] == day) & (daydf["hour"] >= lo) & (daydf["hour"] < hi)
        s = daydf[m]
        return (s["h"].max(), s["l"].min()) if len(s) else (np.nan, np.nan)

    # ---- build level instances: {price, side, a(active_from), b(active_to), day} ----
    levels = {"PDH_PDL": [], "SESSION_ASIA": [], "SESSION_LONDON": [], "SWING": []}
    for i, d in enumerate(days_sorted):
        if i == 0:
            continue
        prev = days_sorted[i - 1]
        a, b = first_idx[d], last_idx[d]
        ph, pl = day_hl.loc[prev, "h"], day_hl.loc[prev, "l"]
        levels["PDH_PDL"].append({"price": ph, "side": "high", "a": a, "b": b, "day": d})
        levels["PDH_PDL"].append({"price": pl, "side": "low", "a": a, "b": b, "day": d})
        for fam, (lo, hi) in (("SESSION_ASIA", (0, 8)), ("SESSION_LONDON", (7, 16))):
            sh, sl_ = sess_hl(prev, lo, hi)
            if np.isfinite(sh):
                levels[fam].append({"price": sh, "side": "high", "a": a, "b": b, "day": d})
                levels[fam].append({"price": sl_, "side": "low", "a": a, "b": b, "day": d})

    # swing levels with explicit confirmation delay
    highs, lows = find_swing_points(df, SWING_ORDER)
    for sw, side in ((highs, "high"), (lows, "low")):
        for p in sw:
            conf = p["index"] + SWING_ORDER          # knowable only here
            levels["SWING"].append({"price": p["price"], "side": side,
                                    "a": conf + 1, "b": min(conf + SWING_ACTIVE, n - 1),
                                    "day": day_id[min(conf, n - 1)]})

    # ---- event detection (first break per level; reclaim vs accept) ----
    def detect(level):
        p, side, a, b = level["price"], level["side"], level["a"], level["b"]
        if not np.isfinite(p) or a >= n:
            return None
        b = min(b, n - 1)
        if side == "high":
            brk = np.flatnonzero(h[a:b + 1] > p + pen)
        else:
            brk = np.flatnonzero(l[a:b + 1] < p - pen)
        if len(brk) == 0:
            return None
        kb = a + int(brk[0])                          # break bar
        w_end = min(kb + RECLAIM_WIN, n - 1)
        if side == "high":
            rc = np.flatnonzero(c[kb:w_end + 1] < p)
        else:
            rc = np.flatnonzero(c[kb:w_end + 1] > p)
        if len(rc):
            kdec = kb + int(rc[0]); kind = "reclaimed"
            direction = -1 if side == "high" else 1   # reclaim high -> short
        else:
            kdec = kb; kind = "accepted"
            direction = 1 if side == "high" else -1   # accept high -> long (continuation)
        return {"kind": kind, "k": kdec, "dir": direction, "day": level["day"]}

    # ---- collect forward returns per family/event-type ----
    def fwd(k, direction, hz):
        if k + hz >= n:
            return None
        return direction * (c[k + hz] - c[k]) / PIP   # direction-adjusted pips

    rows = []   # (family, etype, horizon, net_pips, gross, day)
    for fam, insts in levels.items():
        for lv in insts:
            ev = detect(lv)
            if ev is None:
                continue
            for hz in HORIZONS:
                r = fwd(ev["k"], ev["dir"], hz)
                if r is None:
                    continue
                rows.append((fam, ev["kind"], hz, r - COST, r, ev["day"]))
    R = pd.DataFrame(rows, columns=["fam", "etype", "hz", "net", "gross", "day"])

    # ---- unconditional baseline: signed forward drift from every bar ----
    base = {}
    step = max(1, n // 20000)
    bk = np.arange(0, n, step)
    for hz in HORIZONS:
        valid = bk[bk + hz < n]
        d = (c[valid + hz] - c[valid]) / PIP
        base[hz] = (float(d.mean()), float(d.std()))

    # ================= REPORT =================
    out = []
    P = out.append
    P("LIQUIDITY REACTION FORENSIC — TRAIN (read-only, exploratory)\n")
    P("QUESTION: Do reclaimed-break events carry intraday directional information")
    P("          that differs from ordinary/accepted breaks and the unconditional baseline?\n")
    P(f"DATA: {PAIR} M1 (bid/ask), TRAIN split only, n={n} bars, "
      f"{len(days_sorted)} days. VAULT untouched. cost={COST} pips.")
    P("DEFINITIONS: penetration=1.0pip, reclaim_window=30 bars, swing order=2 "
      "(delay=2), swing_active=480, horizons=5/15/30/60/120m, first-break debounce.\n")

    P("UNCONDITIONAL BASELINE — signed forward drift (pips), should be ≈0:")
    P("  " + "  ".join(f"{hz}m={base[hz][0]:+.2f}(s{base[hz][1]:.1f})" for hz in HORIZONS))
    P("")

    P("OBSERVED — direction-adjusted forward return, NET of cost (pips):")
    P(f"{'family':15}{'event':10}{'N':>6}  " + "".join(f"{str(hz)+'m':>8}" for hz in HORIZONS))
    for fam in levels:
        for et in ("reclaimed", "accepted"):
            sub = R[(R.fam == fam) & (R.etype == et)]
            if sub.empty:
                continue
            n_ev = sub[sub.hz == HORIZONS[0]].shape[0]
            cells = "".join(f"{sub[sub.hz==hz]['net'].mean():>8.2f}" for hz in HORIZONS)
            P(f"{fam:15}{et:10}{n_ev:>6}  {cells}")
    P("")

    P("COMPARISON — RECLAIMED (pooled) vs ACCEPTED vs BASELINE, per horizon:")
    P(f"{'horizon':>8}{'reclaimed_net':>16}{'CI95':>22}{'win%':>7}{'accepted_net':>14}")
    for hz in HORIZONS:
        rec = R[(R.etype == "reclaimed") & (R.hz == hz)]
        acc = R[(R.etype == "accepted") & (R.hz == hz)]
        m, lo, hi = _day_bootstrap(rec["net"].to_numpy(), rec["day"].to_numpy())
        win = (rec["gross"] > 0).mean() if len(rec) else float("nan")
        P(f"{hz:>8}{m:>16.2f}{f'[{lo:+.2f},{hi:+.2f}]':>22}{win:>7.1%}"
          f"{acc['net'].mean() if len(acc) else float('nan'):>14.2f}")
    P("")

    r30 = R[(R.etype == "reclaimed") & (R.hz == 30)]
    if len(r30):
        by_day = r30.groupby("day")["net"].mean()
        P("RECLAIMED @30m diagnostics:")
        P(f"  events={len(r30)}  days={r30['day'].nunique()}  "
          f"events/day≈{len(r30)/max(r30['day'].nunique(),1):.2f}")
        P(f"  net mean={r30['net'].mean():+.2f}  median={r30['net'].median():+.2f}  "
          f"gross mean={r30['gross'].mean():+.2f}")
        P(f"  single best day mean {by_day.max():+.2f}; worst {by_day.min():+.2f}")
    P("")

    P("PRIOR-EVIDENCE CHECK:")
    P("  - ORB fade (break-failure/reversal at the opening range) did NOT survive validation.")
    P("  - research/edge_level_to_level.py found entry->nearest-liquidity ~ fair odds.")
    P("  - This is a NARROWER structural test (acceptance vs rejection at causal levels),")
    P("    related to but not identical with those. Still single-pair EUR/USD price-derived")
    P("    information -> prior probability of a durable new edge is LOW (not prejudging).")
    P("")
    P("PRICE-PROXY LIMITATION: price-defined liquidity proxies from M1 OHLC/bid-ask,")
    P("  NOT dealer liquidity / order-book / true FX order flow.")
    P("")
    P("SCOPE LIMIT: TRAIN only; exploratory; single EUR/USD; price proxy; no VAULT;")
    P("  no ledger; no strategy. Equal-highs/lows family deferred (no safe causal reuse).")
    return "\n".join(out), R


async def main():
    df = await load_split_cached(PAIR, "M1", "train", limit=200_000)
    report, R = main_sync(df)
    print(report)
    rec = R[R.etype == "reclaimed"]
    best = max(((hz, *_day_bootstrap(rec[rec.hz == hz]["net"].to_numpy(),
                                     rec[rec.hz == hz]["day"].to_numpy()))
                for hz in HORIZONS), key=lambda t: t[1]) if len(rec) else None
    print("\nDECISION:")
    if best is None or best[2] <= 0:            # no horizon's CI lower bound > 0
        print("  NO EVIDENCE / WEAK — no reclaimed horizon shows a net-of-cost mean whose")
        print("  day-aware CI excludes 0. Do NOT preregister. Consistent with the low prior.")
    else:
        print(f"  PROMISING CONDITIONAL SIGNAL @ {best[0]}m (net CI lower bound {best[2]:+.2f} > 0).")
        print("  Freeze this exact definition and take it to a SEPARATE preregistered VALIDATION.")
    print("  (TRAIN-only exploratory evidence - not an edge, no strategy built.)")


if __name__ == "__main__":
    asyncio.run(main())
