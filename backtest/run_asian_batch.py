"""V1.6 — Asian-range (00:00–07:00 UTC) breakout + fade into London (07:00–12:00),
the externally best-supported ORB variant we had not tested (SSRN pre-validation
hypothesis). Two pre-registered variants, cached EUR/USD M1 TRAIN, hardened Judge
(PASS/FAIL/INCONCLUSIVE, FDR across the batch). No filter-stacking — clean
baseline only. Run: python -m backtest.run_asian_batch
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

PAIR, COST_PIPS, FDR_ALPHA, MIN_TRADES, TARGET_MULT = "EUR_USD", 1.6, 0.05, 30, 1.5
LEDGER = Ledger(Path(__file__).resolve().parent.parent / "engine" / "ledger.jsonl")
GATE = {"cost_pips": COST_PIPS, "min_fold_pos": 0.75, "fdr_alpha": FDR_ALPHA,
        "min_trades": MIN_TRADES, "target_mult": TARGET_MULT}
BASE = dict(session_open="00:00", range_min=420, entry_window_min=180,
            target_mult=TARGET_MULT, min_stop_pips=10, max_stop_pips=80, max_tail=900)
ENGINE = dict(sessions=(("07:00", "12:00"),), max_spread_pips=2.0, max_hold_min=300)


def _items():
    for mode in ("breakout", "fade"):
        name = f"asian_london_{mode}"
        spec = {"name": name, "family": "asian_range",
                "params": {**{k: BASE[k] for k in ("session_open", "range_min",
                              "entry_window_min", "target_mult")}, "mode": mode},
                "gate": dict(GATE)}
        strat = make_orb_strategy({**BASE, "mode": mode})
        hyp = Hypothesis(name, strat, PAIR, engine_kwargs=ENGINE, n_folds=4)
        yield spec, hyp


def _stop_scale(res):
    sl = [-t.net_pips for t in res.trades if t.exit_reason == "sl"]
    return float(np.median(sl)) if sl else (
        float(np.median(np.abs(res.net_pips))) if res.n_trades else 10.0)


async def main():
    df = await load_split_cached(PAIR, "M1", "train", limit=200_000)
    print(f"{PAIR} Asian-range batch | cached TRAIN M1 bars={len(df)}  (vault locked)\n")

    items = list(_items())
    for spec, _ in items:
        LEDGER.register(spec)

    verdicts = []
    for spec, hyp in items:
        res = run(hyp, df)
        stop = _stop_scale(res)
        cfg = GateConfig(stop_pips=stop, target_pips=TARGET_MULT * stop, cost_pips=COST_PIPS,
                         min_trades=MIN_TRADES, min_fold_pos=0.75, fdr_alpha=FDR_ALPHA)
        verdicts.append(judge_one(res, cfg, seed=len(verdicts)))

    sig = _bh_significant([v.p_value for v in verdicts], FDR_ALPHA)
    print(f"{'variant':22} {'n':>4} {'win%':>6} {'exp_pips':>9} {'p':>6} "
          f"{'folds+':>7} {'status':>12}")
    for (spec, _), v, s in zip(items, verdicts, sig):
        v.significant = bool(s); v.status = _status(v); v.passed = v.status == "PASS"
        print(f"{v.name:22} {v.n_trades:>4} {v.win_rate:>6.3f} "
              f"{v.expectancy_pips:>9.3f} {v.p_value:>6.3f} {v.fold_pos_frac:>7.2f} "
              f"{v.status:>12}")
        LEDGER.record_result(LEDGER.register(spec), spec,
                             {"split": "train", "status": v.status, "n": v.n_trades,
                              "expectancy_pips": v.expectancy_pips, "p_value": v.p_value})

    n_pass = sum(v.passed for v in verdicts)
    n_inc = sum(v.status == "INCONCLUSIVE" for v in verdicts)
    print(f"\nPASS {n_pass} | INCONCLUSIVE {n_inc} | FAIL {len(verdicts)-n_pass-n_inc}  "
          f"(experiments logged: {LEDGER.experiment_count()})")
    print("VERDICT:", "candidate(s) → validation split" if (n_pass or n_inc)
          else "none cleared → document intraday dead-end")


if __name__ == "__main__":
    asyncio.run(main())
