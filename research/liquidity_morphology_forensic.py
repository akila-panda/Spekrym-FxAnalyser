"""Track 1.1 — Liquidity-Reaction MORPHOLOGY Forensic (READ-ONLY, TRAIN only).

Track 1 found pooled reclaimed events have ~0 gross forward return and ~-1.5 pips
net (just the cost). This does NOT reinterpret that. The narrower question:

  Does any SINGLE pre-specified morphology dimension of a causal penetration/reclaim
  event distinguish subsequent EUR/USD returns from (a) the unconditional baseline,
  (b) an ordinary level touch, (c) a (causally-labelled) accepted break?

One-dimensional conditional tests only. NO composite score, NO combination search,
NO threshold optimization. Effect sizes + day-aware bootstrap CIs, not p-hunting.
TRAIN only, VAULT never touched, ledger never written, no strategy.

Causality: reuses Track 1's causal levels (PDH/PDL, prior Asia/London H/L, confirmed
swings with explicit +order-bar delay). The accepted-break control is labelled
CAUSALLY: it is only known to be "accepted" after the reclaim window, so its forward
return is measured from (break_bar + reclaim_window), fixing the Track 1 look-ahead.

Price-proxy limitation: price-defined liquidity proxies from M1 OHLC/bid-ask — NOT
dealer liquidity, order book, stop clusters, or true FX order flow.

Fixed definitions (predefined, never optimized): penetration=1pip, reclaim_window=30,
swing order=2 (delay 2), swing_active=480, horizons 5/15/30/60/120m, cost=1.6 pips.
Morphology bins are all predefined below.

Run: python -m research.liquidity_morphology_forensic
"""
import asyncio
import numpy as np
import pandas as pd

from engine.datacache import load_split_cached
from ta_engine.support_resistance import find_swing_points

PAIR, PIP = "EUR_USD", 0.0001
PEN, RECLAIM_WIN, SWING_ORDER, SWING_ACTIVE = 1.0, 30, 2, 480
HORIZONS, COST = [5, 15, 30, 60, 120], 1.6
PRIMARY = 30
RNG = np.random.default_rng(11)


def _boot(vals, days, iters=3000):
    vals, days = np.asarray(vals, float), np.asarray(days)
    if len(vals) < 8:
        return (float(vals.mean()) if len(vals) else 0.0, float("nan"), float("nan"), 1.0)
    uniq = np.unique(days)
    by = {d: vals[days == d] for d in uniq}
    m = np.array([np.concatenate([by[d] for d in RNG.choice(uniq, len(uniq), True)]).mean()
                  for _ in range(iters)])
    return (float(vals.mean()), float(np.percentile(m, 2.5)),
            float(np.percentile(m, 97.5)), float((m <= 0).mean()))


def _session(hr):
    if 0 <= hr < 7:   return "Asia"
    if 7 <= hr < 12:  return "London"
    if 12 <= hr < 16: return "Overlap"
    if 16 <= hr < 21: return "NY"
    return "late"


def build(df):
    ts = pd.to_datetime(df["ts"], utc=True)
    o = df["o"].to_numpy(float); h = df["h"].to_numpy(float)
    l = df["l"].to_numpy(float); c = df["c"].to_numpy(float)
    hour = ts.dt.hour.to_numpy()
    day_id = ts.dt.strftime("%Y-%m-%d").to_numpy()
    n = len(df)
    atr = pd.Series(h - l).rolling(60).mean().shift(1).bfill().to_numpy().copy()
    atr[atr <= 0] = np.nanmedian(atr)
    pen = PEN * PIP

    daydf = pd.DataFrame({"day": day_id, "h": h, "l": l, "hour": hour, "idx": np.arange(n)})
    days_sorted = list(dict.fromkeys(day_id))
    dhl = daydf.groupby("day").agg(h=("h", "max"), l=("l", "min"))
    fi = daydf.groupby("day")["idx"].min().to_dict()
    li = daydf.groupby("day")["idx"].max().to_dict()

    def shl(day, lo, hi):
        m = (daydf.day == day) & (daydf.hour >= lo) & (daydf.hour < hi)
        s = daydf[m]
        return (s.h.max(), s.l.min()) if len(s) else (np.nan, np.nan)

    levels = []
    for i, d in enumerate(days_sorted):
        if i == 0:
            continue
        prev, a, b = days_sorted[i-1], fi[d], li[d]
        levels.append(("PDHL", dhl.loc[prev, "h"], "high", a, b))
        levels.append(("PDHL", dhl.loc[prev, "l"], "low", a, b))
        for fam, (lo, hi) in (("ASIA", (0, 8)), ("LONDON", (7, 16))):
            sh, sl = shl(prev, lo, hi)
            if np.isfinite(sh):
                levels.append((fam, sh, "high", a, b)); levels.append((fam, sl, "low", a, b))
    hs, ls = find_swing_points(df, SWING_ORDER)
    for sw, side in ((hs, "high"), (ls, "low")):
        for p in sw:
            conf = p["index"] + SWING_ORDER
            levels.append(("SWING", p["price"], side, conf + 1, min(conf + SWING_ACTIVE, n - 1)))

    return dict(o=o, h=h, l=l, c=c, hour=hour, day_id=day_id, atr=atr, pen=pen,
                n=n, levels=levels, days=len(days_sorted))


def detect(S):
    o, h, l, c, atr, pen, n = S["o"], S["h"], S["l"], S["c"], S["atr"], S["pen"], S["n"]
    day_id, hour = S["day_id"], S["hour"]
    D, C, B = [], [], []     # reclaimed, accepted(causal), touch
    for fam, p, side, a, b in S["levels"]:
        if not np.isfinite(p) or a >= n:
            continue
        b = min(b, n - 1)
        if a > b:
            continue
        hi_slice, lo_slice = h[a:b+1], l[a:b+1]
        if side == "high":
            tt = np.flatnonzero(hi_slice >= p - pen)
        else:
            tt = np.flatnonzero(lo_slice <= p + pen)
        if len(tt):
            kt = a + int(tt[0]); dirc = -1 if side == "high" else 1
            B.append((kt, dirc, day_id[kt]))
        if side == "high":
            br = np.flatnonzero(hi_slice > p + pen)
        else:
            br = np.flatnonzero(lo_slice < p - pen)
        if len(br) == 0:
            continue
        kb = a + int(br[0]); we = min(kb + RECLAIM_WIN, n - 1)
        if side == "high":
            rc = np.flatnonzero(c[kb:we+1] < p)
        else:
            rc = np.flatnonzero(c[kb:we+1] > p)
        if len(rc):
            kr = kb + int(rc[0]); dirc = -1 if side == "high" else 1
            depth = (h[kb:kr+1].max() - p)/PIP if side == "high" else (p - l[kb:kr+1].min())/PIP
            rng = max(h[kr]-l[kr], 1e-9)
            wick = (h[kr]-max(o[kr], c[kr]))/rng if side == "high" else (min(o[kr], c[kr])-l[kr])/rng
            body = abs(c[kr]-o[kr])/rng
            appr = (c[kb]-c[kb-30])/atr[kb] if kb >= 30 else np.nan
            appr = appr if side == "high" else -appr
            D.append(dict(fam=fam, k=kr, dir=dirc, day=day_id[kr],
                          depth_atr=(depth*PIP)/atr[kb], speed=kr-kb, wick=wick, body=body,
                          appr=appr, sess=_session(hour[kr]), age=kb-a))
        else:
            kd = min(kb + RECLAIM_WIN, n - 1); dirc = 1 if side == "high" else -1
            C.append((kd, dirc, day_id[kd]))
    return D, C, B


def fwd(c, k, dirc, hz, n):
    return dirc * (c[k+hz]-c[k])/PIP if k+hz < n else None


def _net_row(c, events, hz, n):
    vals, days, gross = [], [], []
    for k, dirc, day in events:
        r = fwd(c, k, dirc, hz, n)
        if r is None:
            continue
        vals.append(r - COST); gross.append(r); days.append(day)
    if not vals:
        return None
    m, lo, hi, p = _boot(vals, days)
    return (m, lo, hi, p, float((np.array(gross) > 0).mean()), len(vals), len(set(days)))


def main_sync(df):
    S = build(df); c, n = S["c"], S["n"]
    D, C, B = detect(S)
    P = []; W = P.append
    W("LIQUIDITY REACTION MORPHOLOGY FORENSIC — TRAIN (read-only, exploratory)\n")
    W("QUESTION: does any single pre-specified morphology of a causal penetration/")
    W("  reclaim distinguish forward EUR/USD returns from baseline / touch / accepted?\n")
    W(f"DATA: {PAIR} M1 bid/ask, TRAIN only, n={n}, days={S['days']}. cost={COST} pips. VAULT untouched.")
    W("DEFINITIONS unchanged from Track 1 (pen=1pip, reclaim=30, swing order2 delay2,")
    W("  swing_active=480). Accepted control labelled CAUSALLY (return from break+30).\n")

    reclaimed = [(e["k"], e["dir"], e["day"]) for e in D]
    step = max(1, n//20000); bk = np.arange(0, n, step)
    W("CONTROL GROUPS — direction-adjusted NET pips (day-aware CI95 at 30m):")
    W(f"{'group':12}{'N':>7}{'days':>6}  " + "".join(f"{str(hz)+'m':>8}" for hz in HORIZONS))
    for name, ev in (("reclaimed", reclaimed), ("accepted*", C), ("touch", B)):
        cells = ""
        for hz in HORIZONS:
            r = _net_row(c, ev, hz, n)
            cells += f"{r[0]:>8.2f}" if r else f"{'--':>8}"
        r30 = _net_row(c, ev, PRIMARY, n)
        W(f"{name:12}{(r30[5] if r30 else 0):>7}{(r30[6] if r30 else 0):>6}  {cells}")
    bcell = ""
    for hz in HORIZONS:
        v = bk[bk+hz < n]; bcell += f"{((c[v+hz]-c[v])/PIP).mean():>8.2f}"
    W(f"{'baseline':12}{len(bk):>7}{S['days']:>6}  {bcell}")
    r30 = _net_row(c, reclaimed, PRIMARY, n)
    W(f"\n  reclaimed@30m CI95 = [{r30[1]:+.2f},{r30[2]:+.2f}]  win={r30[4]:.1%}\n")

    Df = pd.DataFrame(D)

    def binned(fn, labels):
        Df["_bin"] = Df.apply(fn, axis=1)
        rows = []
        for lab in labels:
            sub = Df[Df._bin == lab]
            ev = [(r.k, r.dir, r.day) for r in sub.itertuples()]
            r = _net_row(c, ev, PRIMARY, n)
            if r:
                rows.append((lab, r))
        return rows

    tests = {
        "sweep_depth(/ATR)": (lambda r: ("shallow<=.10" if r.depth_atr <= .10 else
                              "med.10-.25" if r.depth_atr <= .25 else
                              "deep.25-.50" if r.depth_atr <= .50 else "vdeep>.50"),
                              ["shallow<=.10", "med.10-.25", "deep.25-.50", "vdeep>.50"]),
        "reclaim_speed": (lambda r: ("<=2" if r.speed <= 2 else "3-5" if r.speed <= 5 else
                          "6-10" if r.speed <= 10 else "11-30"), ["<=2", "3-5", "6-10", "11-30"]),
        "rejection_wick": (lambda r: ("weak<=.33" if r.wick <= .33 else
                           "med.33-.5" if r.wick <= .5 else "strong>.5"),
                           ["weak<=.33", "med.33-.5", "strong>.5"]),
        "approach_mom": (lambda r: ("na" if not np.isfinite(r.appr) else
                         "against<0" if r.appr < 0 else "low0-.5" if r.appr <= .5 else "high>.5"),
                         ["against<0", "low0-.5", "high>.5"]),
        "level_age(bars)": (lambda r: ("fresh<=60" if r.age <= 60 else
                            "mid60-240" if r.age <= 240 else "old>240"),
                            ["fresh<=60", "mid60-240", "old>240"]),
        "session": (lambda r: r.sess, ["Asia", "London", "Overlap", "NY", "late"]),
        "family": (lambda r: r.fam, ["PDHL", "ASIA", "LONDON", "SWING"]),
    }
    W("MORPHOLOGY — reclaimed events binned ONE dimension at a time, NET pips @30m:")
    all_pvals = []
    for name, (fn, labs) in tests.items():
        W(f"  [{name}]")
        for lab, r in binned(fn, labs):
            m, lo, hi, p, win, nev, nday = r
            flag = "  <-- CI>0" if lo > 0 else ("  <-- CI<0" if hi < 0 else "")
            W(f"     {lab:14} n={nev:5d} days={nday:3d}  net={m:+6.2f} "
              f"CI[{lo:+.2f},{hi:+.2f}] win={win:.0%}{flag}")
            all_pvals.append((f"{name}:{lab}", p, lo, nev, nday))
    # adequacy gate (predefined, per spec "minimum event counts / adequate sample"):
    MIN_EVENTS, MIN_DAYS = 200, 30
    m = len(all_pvals)
    order = sorted(range(m), key=lambda i: all_pvals[i][1])
    bh_hits = [all_pvals[i][0] for rank, i in enumerate(order, 1)
               if all_pvals[i][1] <= rank/m*0.05 and all_pvals[i][2] > 0
               and all_pvals[i][3] >= MIN_EVENTS and all_pvals[i][4] >= MIN_DAYS]
    under = [all_pvals[i][0] for i in order
             if all_pvals[i][2] > 0 and (all_pvals[i][3] < MIN_EVENTS or all_pvals[i][4] < MIN_DAYS)
             and all_pvals[i][1] <= 0.05]
    if under:
        W(f"  (under-powered positive bins excluded by adequacy gate "
          f">= {MIN_EVENTS} events & {MIN_DAYS} days: {under})")
    W(f"\nMULTIPLE-TESTING: {m} predefined bins; BH@5% positive-surviving = "
      f"{bh_hits if bh_hits else 'NONE'}")
    return "\n".join(P), D, bh_hits


async def main():
    df = await load_split_cached(PAIR, "M1", "train", limit=200_000)
    report, D, bh_hits = main_sync(df)
    print(report)
    print("\nPRIOR-EVIDENCE CHECK: ORB fade (validation-failed), level-to-level (~fair),")
    print("  Track 1 unconditional reclaim (~0 gross). Still single-pair EUR/USD price")
    print("  information -> prior LOW. PRICE-PROXY only (no order flow).")
    print("\nDECISION:")
    if not bh_hits:
        print("  NO EVIDENCE TO JUSTIFY CONTINUATION — no predefined morphology bin shows a")
        print("  net-of-cost effect with a day-aware CI>0 surviving multiple-testing.")
    else:
        print(f"  PROMISING CONDITIONAL SIGNAL in {bh_hits} — freeze that EXACT definition and")
        print("  take it to a SEPARATE preregistered VALIDATION (do not build a strategy now).")
    print("  SCOPE: TRAIN-only exploratory; single EUR/USD; price proxy; no VAULT; no strategy.")


if __name__ == "__main__":
    asyncio.run(main())
