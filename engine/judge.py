"""V0.3 — the Judge. Fixed statistical gates, applied to RunResults.

A single experiment is judged on: expectancy net of cost (bootstrap one-sided
p-value that expectancy > 0), beating the cost-adjusted break-even win rate,
fold-consistency, and a minimum trade count. Because trying many variants
manufactures false positives, final significance is decided across a BATCH with
a Benjamini-Hochberg FDR correction keyed to how many experiments were run — the
practical realisation of "deflate for the number of trials" (roadmap §0, V0.3).

The Judge is deterministic and holds no opinion: it consumes numbers and emits a
pass/fail. The strategy's author cannot argue with it.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from engine.runner import RunResult


@dataclass
class GateConfig:
    stop_pips: float
    target_pips: float
    cost_pips: float = 1.6
    min_trades: int = 30
    min_fold_pos: float = 0.75      # ≥75% of folds positive on expectancy
    fdr_alpha: float = 0.05
    boot_iters: int = 2000

    @property
    def fair_win_rate(self) -> float:
        return self.stop_pips / (self.stop_pips + self.target_pips)

    @property
    def breakeven_win_rate(self) -> float:
        # win rate at which expectancy net of cost = 0
        return (self.stop_pips + self.cost_pips) / (self.stop_pips + self.target_pips)


@dataclass
class Verdict:
    name: str
    n_trades: int
    expectancy_pips: float
    win_rate: float
    breakeven_win_rate: float
    beats_breakeven: bool       # DIAGNOSTIC only — not a pass/fail gate (V0.5 #3)
    fold_pos_frac: float
    sharpe: float
    p_value: float              # one-sided: P(expectancy <= 0)
    enough_trades: bool
    expectancy_positive: bool
    fold_ok: bool
    significant: bool = False    # survived batch FDR correction
    status: str = "FAIL"         # PASS | FAIL | INCONCLUSIVE
    passed: bool = False         # status == PASS
    reasons: list = field(default_factory=list)


def _boot_p(x: np.ndarray, iters: int, seed: int = 0) -> float:
    if len(x) < 5:
        return 1.0
    rng = np.random.default_rng(seed)
    means = np.array([rng.choice(x, len(x), replace=True).mean() for _ in range(iters)])
    return float((means <= 0).mean())


def _bh_significant(pvals: list[float], alpha: float) -> np.ndarray:
    """Benjamini-Hochberg: returns a boolean mask of significant p-values."""
    m = len(pvals)
    sig = np.zeros(m, dtype=bool)
    if m == 0:
        return sig
    order = np.argsort(pvals)
    max_rank = 0
    for rank, idx in enumerate(order, start=1):
        if pvals[idx] <= (rank / m) * alpha:
            max_rank = rank
    for rank, idx in enumerate(order, start=1):
        if rank <= max_rank:
            sig[idx] = True
    return sig


def judge_one(run: RunResult, cfg: GateConfig, seed: int = 0) -> Verdict:
    pips = run.net_pips
    n = run.n_trades
    exp = run.expectancy_pips
    wr = run.win_rate
    sharpe = float(pips.mean() / pips.std()) if n > 1 and pips.std() > 0 else 0.0
    p = _boot_p(pips, cfg.boot_iters, seed) if n else 1.0
    fold_pos = (np.mean([f.expectancy_pips > 0 for f in run.folds])
                if run.folds else 0.0)

    # Expectancy net of cost is the PRIMARY metric. The fair/break-even win rate
    # is reported as a diagnostic only — it is not a pass/fail gate, because ORB's
    # variable stops, time exits and session-close exits break the simple
    # fixed-stop/fixed-target Bernoulli assumption behind it (V0.5 #2/#3).
    enough_trades = n >= cfg.min_trades
    expectancy_positive = exp > 0
    fold_ok = fold_pos >= cfg.min_fold_pos
    beats = wr >= cfg.breakeven_win_rate

    reasons = []
    if not enough_trades:
        reasons.append(f"insufficient evidence: {n}<{cfg.min_trades} trades")
    elif not expectancy_positive:
        reasons.append("expectancy <= 0 net of cost")
    elif not fold_ok:
        reasons.append(f"fold-consistency {fold_pos:.2f} < {cfg.min_fold_pos}")

    return Verdict(
        name=run.name, n_trades=n, expectancy_pips=exp, win_rate=wr,
        breakeven_win_rate=cfg.breakeven_win_rate, beats_breakeven=beats,
        fold_pos_frac=float(fold_pos), sharpe=sharpe, p_value=p,
        enough_trades=enough_trades, expectancy_positive=expectancy_positive,
        fold_ok=fold_ok, reasons=reasons,
    )


def judge_batch(runs: list[RunResult], cfg: GateConfig) -> list[Verdict]:
    """Judge a whole pre-registered batch. FDR correction is applied across ALL
    experiments in the batch, so a variant that looks good only because many were
    tried does not pass."""
    verdicts = [judge_one(r, cfg, seed=i) for i, r in enumerate(runs)]
    sig = _bh_significant([v.p_value for v in verdicts], cfg.fdr_alpha)
    for v, s in zip(verdicts, sig):
        v.significant = bool(s)
        v.status = _status(v)
        v.passed = v.status == "PASS"
        if v.status == "INCONCLUSIVE" and v.enough_trades and v.expectancy_positive \
                and not v.significant:
            v.reasons.append("positive but not significant after FDR (inconclusive)")
    return verdicts


def _status(v: Verdict) -> str:
    """FAIL = evidence of no edge. INCONCLUSIVE = too few trades, or a positive
    point estimate that isn't significant/consistent yet. PASS = significant,
    consistent, positive expectancy (V0.5 #4)."""
    if not v.enough_trades:
        return "INCONCLUSIVE"            # insufficient evidence, not a failure
    if not v.expectancy_positive:
        return "FAIL"                    # real evidence against an edge
    if v.significant and v.fold_ok:
        return "PASS"
    return "INCONCLUSIVE"                # positive but noisy or inconsistent
