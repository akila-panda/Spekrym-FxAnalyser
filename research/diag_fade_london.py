"""Diagnostics for the fade_london_15m INCONCLUSIVE lead (V1.5). READ-ONLY — no
tuning, no new variants. Answers: is the +0.96 pips consistent, or a handful of
large winners? Runs the hypothesis exactly as registered, on cached TRAIN only.
Run: python -m research.diag_fade_london
"""
import asyncio
import numpy as np

from engine.datacache import load_split_cached
from engine.runner import Hypothesis, run
from market_context.orb_strategy import make_orb_strategy

PAIR = "EUR_USD"


async def main():
    df = await load_split_cached(PAIR, "M1", "train", limit=200_000)
    strat = make_orb_strategy({"session_open": "07:00", "range_min": 15,
                               "mode": "fade", "target_mult": 1.5})
    res = run(Hypothesis("fade_london_15m", strat, PAIR,
                         engine_kwargs=dict(sessions=(("07:00", "16:00"),),
                                            max_spread_pips=2.0, max_hold_min=300),
                         n_folds=4), df)
    tr = res.trades
    pips = res.net_pips
    wins = pips[pips > 0]
    losses = pips[pips <= 0]
    spread = np.array([t.spread_at_entry for t in tr])
    longs = np.array([t.net_pips for t in tr if t.direction == "long"])
    shorts = np.array([t.net_pips for t in tr if t.direction == "short"])

    print(f"fade_london_15m | TRAIN | n={len(tr)}")
    print(f"  win_rate      {(pips > 0).mean():.3f}   ({len(wins)} win / {len(losses)} loss)")
    print(f"  net expectancy {pips.mean():+.3f} pips   median {np.median(pips):+.2f}")
    print(f"  avg win       {wins.mean():+.2f}   avg loss {losses.mean():+.2f}")
    print(f"  gross (pre-spread) ≈ {pips.mean() + spread.mean():+.3f}   mean spread {spread.mean():.2f}")
    print(f"  long  n={len(longs):3d} exp={longs.mean() if len(longs) else 0:+.3f}")
    print(f"  short n={len(shorts):3d} exp={shorts.mean() if len(shorts) else 0:+.3f}")

    # concentration: how much of total P&L comes from the top few winners?
    order = np.sort(pips)[::-1]
    total = pips.sum()
    print(f"  total P&L {total:+.1f} pips")
    for k in (1, 3, 5):
        exp_wo = (pips.sum() - order[:k].sum()) / (len(pips) - k)
        print(f"  remove top {k} winners -> expectancy {exp_wo:+.3f} pips")

    # per-fold
    print("  per-fold (chronological):")
    for i, ch in enumerate(np.array_split(pips, 4)):
        print(f"    fold {i}: n={len(ch):3d}  exp={ch.mean():+.3f}  win={(ch > 0).mean():.2f}")

    print("  exit mix: " + str({r: sum(1 for t in tr if t.exit_reason == r)
                                 for r in ("tp", "sl", "time", "session_end")}))


if __name__ == "__main__":
    asyncio.run(main())
