"""V1.3 — pre-registered ORB variant batch, judged on real EUR/USD M1 TRAIN data.

Registers all variants (name + gate) BEFORE running, runs each through the
engine on the TRAIN split (VAULT stays locked), judges them as ONE batch with
FDR correction, and logs every verdict. This is the first real test of whether an
intraday ORB edge exists. Run: python -m backtest.run_orb_batch
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

PAIR = "EUR_USD"
TARGET_MULT = 1.5
COST_PIPS = 1.6
FDR_ALPHA = 0.05
MIN_TRADES = 30
LEDGER = Ledger(Path(__file__).resolve().parent.parent / "engine" / "ledger.jsonl")

SESS = {"london": ("07:00", "16:00"), "ny": ("13:00", "21:00")}


def _variants():
    for sess in ("london", "ny"):
        for rmin in (15, 30):
            for vol in (False, True):
                yield {"session": sess, "range_min": rmin, "use_volume": vol}


def _spec(v):
    return {"name": f"orb_{v['session']}_{v['range_min']}m_vol{int(v['use_volume'])}",
            "params": {"session_open": SESS[v["session"]][0], "range_min": v["range_min"],
                       "target_mult": TARGET_MULT, "use_volume": v["use_volume"]},
            "gate": {"target_mult": TARGET_MULT, "cost_pips": COST_PIPS,
                     "min_fold_pos": 0.75, "fdr_alpha": FDR_ALPHA, "min_trades": MIN_TRADES}}


def _stop_scale(result):
    sl = [-t.net_pips for t in result.trades if t.exit_reason == "sl"]
    if sl:
        return float(np.median(sl))
    return float(np.median(np.abs(result.net_pips))) if result.n_trades else 10.0


async def main():
    df = await load_split_cached(PAIR, "M1", "train", limit=200_000)
    print(f"{PAIR} ORB batch | TRAIN M1 bars={len(df)}  (vault locked)\n")

    specs = [_spec(v) for v in _variants()]
    for s in specs:                         # pre-register BEFORE running
        LEDGER.register(s)

    verdicts, results = [], []
    for v, s in zip(_variants(), specs):
        so, sc = SESS[v["session"]]
        strat = make_orb_strategy({"session_open": so, "range_min": v["range_min"],
                                   "use_volume": v["use_volume"], "target_mult": TARGET_MULT})
        hyp = Hypothesis(name=s["name"], strategy_fn=strat, pair=PAIR,
                         engine_kwargs=dict(sessions=((so, sc),), max_spread_pips=2.0,
                                            max_hold_min=300), n_folds=4)
        res = run(hyp, df)
        stop = _stop_scale(res)
        cfg = GateConfig(stop_pips=stop, target_pips=TARGET_MULT * stop,
                         cost_pips=COST_PIPS, min_trades=MIN_TRADES,
                         min_fold_pos=0.75, fdr_alpha=FDR_ALPHA)
        verdicts.append(judge_one(res, cfg, seed=len(verdicts)))
        results.append(res)

    sig = _bh_significant([v.p_value for v in verdicts], FDR_ALPHA)  # FDR across the batch
    for v, s in zip(verdicts, sig):
        v.significant = bool(s)
        v.status = _status(v)
        v.passed = v.status == "PASS"

    print(f"{'variant':24} {'n':>4} {'win%':>6} {'exp_pips':>9} {'p':>6} "
          f"{'folds+':>7} {'status':>12}")
    for v in verdicts:
        print(f"{v.name:24} {v.n_trades:>4} {v.win_rate:>6.3f} "
              f"{v.expectancy_pips:>9.3f} {v.p_value:>6.3f} "
              f"{v.fold_pos_frac:>7.2f} {v.status:>12}")

    for s, v in zip(specs, verdicts):       # log every verdict
        LEDGER.record_result(LEDGER.register(s), s,
                             {"status": v.status, "passed": v.passed, "n": v.n_trades,
                              "expectancy_pips": v.expectancy_pips,
                              "win_rate": v.win_rate, "p_value": v.p_value,
                              "fold_pos_frac": v.fold_pos_frac})

    n_pass = sum(v.passed for v in verdicts)
    print(f"\nPASSED after FDR: {n_pass}/{len(verdicts)}  "
          f"(experiments logged: {LEDGER.experiment_count()})")
    print("VERDICT:", "candidate(s) → V1.4 vault confirmation" if n_pass
          else "none cleared → V1.5 pivot")


if __name__ == "__main__":
    asyncio.run(main())
