"""ORB FORENSICS V1 — READ-ONLY autopsy of the failed ORB breakout trades.

Reconstructs every trade from the 8 ORB breakout variants on TRAIN and measures
WHY they lost. No new entries, no filters, no tuning, Judge untouched, VAULT
sealed. Output strictly separates OBSERVED facts from INTERPRETATION.

Two headline pieces (per the locked decision tree):
  1. MFE/MAE in R  -> is the breakout DIRECTION informative at all?
  2. first-break vs repeated-signal -> is the current implementation contaminated?
Location / retest / structural measurements are DEFERRED to a phase-2 that only
runs IF MFE is substantial (if MFE is tiny, they are moot).

Loss-tag definitions (documented, evidence-based; a trade may carry several):
  BAD_DIRECTION  = losing trade, MFE_R < 0.25   (almost no favorable movement)
  STALLED        = losing trade, 0.25 <= MFE_R < 1.0
  EXIT_PROBLEM   = losing trade, MFE_R >= 1.0    (reached >=1R favorable, still lost)
  COST_DOMINATED = losing trade, net+spread > 0  (gross positive; cost flipped it)

Run: python -m research.orb_forensics
"""
import asyncio

import numpy as np
import pandas as pd

from engine.datacache import load_split_cached
from engine.runner import Hypothesis, run
from market_context.orb_strategy import make_orb_strategy

PAIR, PIP = "EUR_USD", 0.0001
SESS = {"london": ("07:00", "16:00"), "ny": ("13:00", "21:00")}


def _variants():
    for s in ("london", "ny"):
        for r in (15, 30):
            for vol in (False, True):
                yield s, r, vol


def _mfe_mae(t, idx, bh, bl, ah, al):
    i0 = idx.get(pd.to_datetime(t.entry_ts, utc=True))
    i1 = idx.get(pd.to_datetime(t.exit_ts, utc=True))
    if i0 is None or i1 is None or i1 < i0 or t.R == 0:
        return None
    sl = abs(t.net_pips / t.R)                       # sl_pips = net_pips / R (USD quote)
    if sl <= 0:
        return None
    if t.direction == "long":
        mfe = (bh[i0:i1 + 1].max() - t.entry) / PIP
        mae = (t.entry - bl[i0:i1 + 1].min()) / PIP
    else:
        mfe = (t.entry - al[i0:i1 + 1].min()) / PIP
        mae = (ah[i0:i1 + 1].max() - t.entry) / PIP
    return {"dir": t.direction, "net": t.net_pips, "spread": t.spread_at_entry,
            "exit": t.exit_reason, "sl": sl, "mfe_R": mfe / sl, "mae_R": mae / sl,
            "entry_ts": t.entry_ts,
            "date": str(pd.to_datetime(t.entry_ts, utc=True).date())}


async def main():
    df = await load_split_cached(PAIR, "M1", "train", limit=200_000)
    ts = pd.to_datetime(df["ts"], utc=True).reset_index(drop=True)
    idx = {t: i for i, t in enumerate(ts)}
    bh, bl = df["bid_h"].to_numpy(float), df["bid_l"].to_numpy(float)
    ah, al = df["ask_h"].to_numpy(float), df["ask_l"].to_numpy(float)

    pooled, london15 = [], []
    for s, r, vol in _variants():
        so, sc = SESS[s]
        strat = make_orb_strategy({"session_open": so, "range_min": r,
                                   "use_volume": vol, "mode": "breakout", "target_mult": 1.5})
        res = run(Hypothesis(f"{s}_{r}_{int(vol)}", strat, PAIR,
                             engine_kwargs=dict(sessions=((so, sc),), max_spread_pips=2.0,
                                                max_hold_min=300)), df)
        for t in res.trades:
            row = _mfe_mae(t, idx, bh, bl, ah, al)
            if row is None:
                continue
            pooled.append(row)
            if s == "london" and r == 15 and not vol:
                london15.append(row)

    R = pd.DataFrame(pooled)
    n = len(R)
    print(f"ORB FORENSICS V1 | TRAIN | reconstructed trades={n}  (vault sealed)\n")

    # ===== OBSERVED =====
    print("===== OBSERVED (facts) =====")
    print(f"win_rate={ (R['net']>0).mean():.3f}   mean_net={R['net'].mean():+.2f} pips")
    print(f"MFE_R: p50={R['mfe_R'].median():.2f} p75={R['mfe_R'].quantile(.75):.2f} "
          f"p90={R['mfe_R'].quantile(.90):.2f}   "
          f"MAE_R: p50={R['mae_R'].median():.2f} p90={R['mae_R'].quantile(.90):.2f}\n")

    bins = [-0.01, 0.25, 0.5, 1.0, 1.5, 999]
    labels = ["<0.25R", "0.25-0.5R", "0.5-1.0R", "1.0-1.5R", ">=1.5R"]
    R["mfe_bucket"] = pd.cut(R["mfe_R"], bins=bins, labels=labels)
    print("MFE_R bucket  |  n   share   win%   mean_net")
    for lab in labels:
        b = R[R["mfe_bucket"] == lab]
        if len(b):
            print(f"  {lab:10} | {len(b):4d}  {len(b)/n:5.1%}  {(b['net']>0).mean():5.1%}  "
                  f"{b['net'].mean():+7.2f}")

    losers = R[R["net"] <= 0]
    nl = len(losers)
    bad = (losers["mfe_R"] < 0.25).sum()
    stalled = ((losers["mfe_R"] >= 0.25) & (losers["mfe_R"] < 1.0)).sum()
    exitpb = (losers["mfe_R"] >= 1.0).sum()
    costdom = (losers["net"] + losers["spread"] > 0).sum()
    print(f"\nLoss tags ({nl} losers):")
    print(f"  BAD_DIRECTION  {bad:4d} {bad/nl:5.1%}")
    print(f"  STALLED        {stalled:4d} {stalled/nl:5.1%}")
    print(f"  EXIT_PROBLEM   {exitpb:4d} {exitpb/nl:5.1%}")
    print(f"  COST_DOMINATED {costdom:4d} {costdom/nl:5.1%}")

    # first-break vs repeated-signal (on london_15m_vol0 only, to avoid variant pooling)
    L = pd.DataFrame(london15).sort_values("entry_ts")
    per_day = L.groupby("date")
    first_only = per_day.first()
    print(f"\nFirst-break vs repeated-signal (london_15m_vol0, n={len(L)}):")
    print(f"  distinct sessions={L['date'].nunique()}  trades/session mean={len(L)/max(L['date'].nunique(),1):.2f} "
          f"max={per_day.size().max()}  sessions>1entry={ (per_day.size()>1).mean():.1%}")
    print(f"  mean_net  ALL entries   ={L['net'].mean():+.2f} pips")
    print(f"  mean_net  FIRST-break only={first_only['net'].mean():+.2f} pips")

    # ===== INTERPRETATION =====
    print("\n===== INTERPRETATION (hypotheses, not verdicts) =====")
    share_bad = bad / nl
    if R["mfe_R"].median() < 0.5:
        print("- MFE_R median < 0.5: consistent with WEAK directional information — most")
        print("  trades never move ~half the risk in favor. Points toward closing ORB.")
    else:
        print("- MFE_R median >= 0.5: direction carried some favorable movement; the")
        print("  exit/location architecture is worth investigating (phase-2).")
    if share_bad >= 0.5:
        print(f"- {share_bad:.0%} of losses are BAD_DIRECTION (MFE<0.25R): the breakout mostly")
        print("  had no follow-through. This is a SIGNAL problem, not an exit problem.")
    if exitpb / nl >= 0.25:
        print(f"- {exitpb/nl:.0%} of losses reached >=1R favorable first (EXIT_PROBLEM): some")
        print("  directional info exists but exits gave it back — phase-2 exit study justified.")
    print("- Final PASS/FAIL belongs to the Judge on a NEW pre-registered hypothesis")
    print("  (TRAIN->VALIDATION->VAULT), never to these labels.")


if __name__ == "__main__":
    asyncio.run(main())
