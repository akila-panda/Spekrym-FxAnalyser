"""V1.5 — opening-range FADE + intraday session MOMENTUM, on cached EUR/USD M1
TRAIN data, judged by the hardened Judge (PASS/FAIL/INCONCLUSIVE, FDR across the
batch). Pre-registers every variant before running. Run: python -m backtest.run_v15_batch
"""
from __future__ import annotations

import asyncio
from pathlib import Path

import numpy as np

from engine.datacache import load_split_cached
from engine.ledger import Ledger
from engine.runner import Hypothesis, run
from engine.judge import GateConfig, judge_one, _bh_significant, _status
from market_context.orb_strategy import make_orb_strategy
from market_context.momentum_strategy import make_session_momentum_strategy

PAIR, COST_PIPS, FDR_ALPHA, MIN_TRADES = "EUR_USD", 1.6, 0.05, 30
TARGET_MULT = 1.5
LEDGER = Ledger(Path(__file__).resolve().parent.parent / "engine" / "ledger.jsonl")
SESS = {"london": ("07:00", "16:00"), "ny": ("13:00", "21:00")}
GATE = {"cost_pips": COST_PIPS, "min_fold_pos": 0.75, "fdr_alpha": FDR_ALPHA,
        "min_trades": MIN_TRADES}


def _specs_and_hyps():
    out = []
    # --- opening-range FADE (primitive: no extra filters) ---
    for sess in ("london", "ny"):
        for rmin in (15, 30):
            so, sc = SESS[sess]
            name = f"fade_{sess}_{rmin}m"
            spec = {"name": name, "family": "orb_fade",
                    "params": {"session_open": so, "range_min": rmin,
                               "target_mult": TARGET_MULT, "mode": "fade"},
                    "gate": {**GATE, "target_mult": TARGET_MULT}}
            strat = make_orb_strategy({"session_open": so, "range_min": rmin,
                                       "mode": "fade", "target_mult": TARGET_MULT})
            hyp = Hypothesis(name, strat, PAIR,
                             engine_kwargs=dict(sessions=((so, sc),),
                                                max_spread_pips=2.0, max_hold_min=300))
            out.append((spec, hyp, None))         # stop scale derived from data
    # --- intraday session MOMENTUM ---
    for sess in ("london", "ny"):
        for sig in (30, 60):
            so, sc = SESS[sess]
            name = f"mom_{sess}_{sig}m"
            spec = {"name": name, "family": "session_momentum",
                    "params": {"session_open": so, "signal_min": sig,
                               "sl_pips": 30, "tp_pips": 30},
                    "gate": {**GATE, "sl_pips": 30, "tp_pips": 30}}
            strat = make_session_momentum_strategy({"session_open": so, "signal_min": sig})
            hyp = Hypothesis(name, strat, PAIR,
                             engine_kwargs=dict(sessions=((so, sc),),
                                                max_spread_pips=2.0, max_hold_min=600))
            out.append((spec, hyp, 30.0))         # fixed stop scale
    return out


def _stop_scale(res, fixed):
    if fixed is not None:
        return fixed
    sl = [-t.net_pips for t in res.trades if t.exit_reason == "sl"]
    return float(np.median(sl)) if sl else (
        float(np.median(np.abs(res.net_pips))) if res.n_trades else 10.0)


async def main():
    df = await load_split_cached(PAIR, "M1", "train", limit=200_000)
    print(f"{PAIR} V1.5 batch | cached TRAIN M1 bars={len(df)}  (vault locked)\n")

    items = _specs_and_hyps()
    for spec, _, _ in items:
        LEDGER.register(spec)

    verdicts = []
    for spec, hyp, fixed in items:
        res = run(hyp, df)
        stop = _stop_scale(res, fixed)
        cfg = GateConfig(stop_pips=stop, target_pips=TARGET_MULT * stop,
                         cost_pips=COST_PIPS, min_trades=MIN_TRADES,
                         min_fold_pos=0.75, fdr_alpha=FDR_ALPHA)
        verdicts.append(judge_one(res, cfg, seed=len(verdicts)))

    sig = _bh_significant([v.p_value for v in verdicts], FDR_ALPHA)
    for v, s in zip(verdicts, sig):
        v.significant = bool(s)
        v.status = _status(v)
        v.passed = v.status == "PASS"

    print(f"{'variant':20} {'n':>4} {'win%':>6} {'exp_pips':>9} {'p':>6} "
          f"{'folds+':>7} {'status':>12}")
    for v in verdicts:
        print(f"{v.name:20} {v.n_trades:>4} {v.win_rate:>6.3f} "
              f"{v.expectancy_pips:>9.3f} {v.p_value:>6.3f} "
              f"{v.fold_pos_frac:>7.2f} {v.status:>12}")

    for (spec, _, _), v in zip(items, verdicts):
        LEDGER.record_result(LEDGER.register(spec), spec,
                             {"status": v.status, "passed": v.passed,
                              "n": v.n_trades, "expectancy_pips": v.expectancy_pips,
                              "win_rate": v.win_rate, "p_value": v.p_value})

    n_pass = sum(v.passed for v in verdicts)
    n_inc = sum(v.status == "INCONCLUSIVE" for v in verdicts)
    print(f"\nPASS {n_pass} | INCONCLUSIVE {n_inc} | FAIL "
          f"{len(verdicts) - n_pass - n_inc}  (experiments logged: {LEDGER.experiment_count()})")
    print("VERDICT:", "candidate(s) → V1.4 vault" if n_pass
          else ("inconclusive → more data/variants" if n_inc else "none cleared → document & reassess"))


if __name__ == "__main__":
    asyncio.run(main())
