"""V0.2 — walk-forward runner interface.

One entry point: `run(hypothesis, df) -> RunResult`. It executes the hypothesis'
strategy on `scalp_engine` (which bakes the bid/ask spread into fills, so every
metric is already net of cost) and buckets the resulting trades into N
chronological folds for the Judge's fold-consistency check.

Why no explicit purge/embargo: the scalp engine holds at most one position and
trades are sequential and non-overlapping, so trades bucketed chronologically
into folds share no bars — there is no cross-fold leakage to purge. (When a
*fitted* model is introduced later, add embargo here.)
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable

import numpy as np
import pandas as pd

from backtest.scalp_engine import run_scalp_backtest


@dataclass
class Hypothesis:
    name: str
    strategy_fn: Callable
    pair: str = "EUR_USD"
    engine_kwargs: dict = field(default_factory=dict)   # tp_pips, sl_pips, sessions, ...
    n_folds: int = 4


@dataclass
class FoldResult:
    fold: int
    n: int
    expectancy_pips: float
    win_rate: float


@dataclass
class RunResult:
    name: str
    n_trades: int
    net_pips: np.ndarray
    folds: list
    trades: list

    @property
    def expectancy_pips(self) -> float:
        return float(self.net_pips.mean()) if self.n_trades else 0.0

    @property
    def win_rate(self) -> float:
        return float((self.net_pips > 0).mean()) if self.n_trades else 0.0


def run(hyp: Hypothesis, df: pd.DataFrame) -> RunResult:
    res = run_scalp_backtest(df, hyp.strategy_fn, hyp.pair, **hyp.engine_kwargs)
    trades = sorted(res.trades, key=lambda t: t.entry_ts)
    pips = np.array([t.net_pips for t in trades], dtype=float)

    folds = []
    for i, chunk in enumerate(np.array_split(pips, hyp.n_folds)):
        folds.append(FoldResult(
            fold=i, n=len(chunk),
            expectancy_pips=float(chunk.mean()) if len(chunk) else 0.0,
            win_rate=float((chunk > 0).mean()) if len(chunk) else 0.0,
        ))
    return RunResult(hyp.name, len(trades), pips, folds, trades)


async def run_on_split(hyp: Hypothesis, timeframe: str = "M1",
                       split: str = "train", limit: int = 200_000) -> RunResult:
    """Convenience: load a TRAIN/VALID split (V0.1) and run. VAULT is refused by
    load_split, so the search path can never touch the holdout."""
    from engine.partition import load_split
    df = await load_split(hyp.pair, timeframe, split, limit=limit)
    return run(hyp, df)
