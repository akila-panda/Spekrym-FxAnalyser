"""V0.3 gate: the Judge resists data-dredging — 100 random (null) hypotheses on
one dataset yield ≤ the expected false-positive count after FDR correction — and
it still PASSES a genuine edge. Synthetic; no DB."""
import numpy as np
import pandas as pd

from engine.runner import Hypothesis, run
from engine.judge import GateConfig, judge_batch
from engine.tests.test_runner import _frame, _random_strategy, PIP

CFG = GateConfig(stop_pips=6, target_pips=6, cost_pips=1.6, min_trades=20)
ENGINE = dict(max_spread_pips=3.0, max_hold_min=45)


def _random_run(seed, frame):
    hyp = Hypothesis(name=f"rnd{seed}", strategy_fn=_random_strategy(seed=seed),
                     engine_kwargs=ENGINE, n_folds=4)
    return run(hyp, frame)


def test_judge_controls_false_positives():
    frame = _frame(n_days=6, spread_pips=1.6, seed=42)
    runs = [_random_run(s, frame) for s in range(100)]
    verdicts = judge_batch(runs, CFG)
    passes = sum(v.passed for v in verdicts)
    assert passes <= 5   # FDR at 5% keeps false positives among 100 nulls in check


def _drift_frame(n_days=6, drift=0.6, spread_pips=1.6, seed=0):
    rng = np.random.default_rng(seed)
    rows, mid, half = [], 1.1000, spread_pips * PIP / 2.0
    for d in range(n_days):
        day = pd.Timestamp("2024-01-01", tz="UTC") + pd.Timedelta(days=d)
        for m in range(9 * 60):
            ts = day + pd.Timedelta(hours=7, minutes=m)
            o = mid
            mid = mid + drift * PIP + rng.normal(0, 2 * PIP)
            c = mid
            hi = max(o, c) + abs(rng.normal(0, 1.5 * PIP))
            lo = min(o, c) - abs(rng.normal(0, 1.5 * PIP))
            row = {"ts": ts, "o": o, "h": hi, "l": lo, "c": c, "v": 1}
            for k, base in (("o", o), ("h", hi), ("l", lo), ("c", c)):
                row[f"bid_{k}"] = base - half
                row[f"ask_{k}"] = base + half
            rows.append(row)
    return pd.DataFrame(rows)


def _always_long(ctx):
    return {"direction": "long", "tp_pips": 6, "sl_pips": 6}


def test_judge_passes_true_edge():
    frame = _drift_frame()
    hyp = Hypothesis(name="edge", strategy_fn=_always_long,
                     engine_kwargs=ENGINE, n_folds=4)
    v = judge_batch([run(hyp, frame)], CFG)[0]
    assert v.passed, v.reasons
