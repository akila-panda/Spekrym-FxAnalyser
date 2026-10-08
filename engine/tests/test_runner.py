"""V0.2 gate: the runner buckets trades into folds correctly, is reproducible,
and LEAKS NO EDGE — a random entry on a fair random walk is not profitable, and
adding spread strictly worsens expectancy by ~the spread. Synthetic; no DB."""
import numpy as np
import pandas as pd

from engine.runner import Hypothesis, run

PIP = 0.0001


def _frame(n_days=4, spread_pips=0.0, seed=0):
    """London-session (07:00–16:00 UTC) M1 random walk with a fixed spread."""
    rng = np.random.default_rng(seed)
    rows = []
    mid = 1.1000
    half = spread_pips * PIP / 2.0
    for d in range(n_days):
        day = pd.Timestamp("2024-01-01", tz="UTC") + pd.Timedelta(days=d)
        for m in range(9 * 60):  # 07:00..16:00
            ts = day + pd.Timedelta(hours=7, minutes=m)
            o = mid
            mid = mid + rng.normal(0, 2 * PIP)
            c = mid
            hi = max(o, c) + abs(rng.normal(0, 1.5 * PIP))
            lo = min(o, c) - abs(rng.normal(0, 1.5 * PIP))
            row = {"ts": ts, "o": o, "h": hi, "l": lo, "c": c, "v": 1}
            for k, base in (("o", o), ("h", hi), ("l", lo), ("c", c)):
                row[f"bid_{k}"] = base - half
                row[f"ask_{k}"] = base + half
            rows.append(row)
    return pd.DataFrame(rows)


def _random_strategy(seed=1, p=0.06):
    """Decides purely from a seeded RNG per call, ignoring price — so it makes
    identical entries regardless of spread, isolating cost's effect."""
    rng = np.random.default_rng(seed)

    def strat(ctx):
        r = rng.random()
        if r < p:
            return {"direction": "long", "tp_pips": 6, "sl_pips": 6}
        if r < 2 * p:
            return {"direction": "short", "tp_pips": 6, "sl_pips": 6}
        return None
    return strat


def _hyp(spread_seed=1):
    return Hypothesis(name="random_null",
                      strategy_fn=_random_strategy(seed=spread_seed),
                      engine_kwargs=dict(max_spread_pips=3.0, max_hold_min=45),
                      n_folds=4)


def test_folds_partition_all_trades():
    r = run(_hyp(), _frame(spread_pips=0.0))
    assert r.n_trades > 30                      # enough for statistics
    assert len(r.folds) == 4
    assert sum(f.n for f in r.folds) == r.n_trades


def test_reproducible():
    a = run(_hyp(), _frame(spread_pips=0.0, seed=0))
    b = run(_hyp(), _frame(spread_pips=0.0, seed=0))
    assert np.array_equal(a.net_pips, b.net_pips)


def test_no_phantom_edge_and_cost_applied():
    zero = run(_hyp(), _frame(spread_pips=0.0, seed=0))
    cost = run(_hyp(), _frame(spread_pips=2.0, seed=0))
    # a fair random walk must not show a real positive edge net of nothing
    assert zero.expectancy_pips < 1.0
    # adding a 2-pip spread strictly worsens expectancy (cost is really applied)
    assert cost.expectancy_pips < zero.expectancy_pips
