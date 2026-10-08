"""Index opening-auction ORB — NAS100_USD, through the locked Judge (TRAIN only,
vault sealed). Pre-registers 6 variants, measures real spread in points, judges as
one FDR-corrected batch. Run: python -m backtest.run_index_orb
"""
from __future__ import annotations

import asyncio
from pathlib import Path

import numpy as np

from engine.datacache import load_split_cached
from engine.ledger import Ledger
from engine.runner import Hypothesis, run
from engine.judge import GateConfig, judge_one, _bh_significant, _status
from market_context.index_orb_strategy import make_index_orb_strategy

PAIR, TARGET_MULT, FDR_ALPHA, MIN_TRADES = "NAS100_USD", 1.5, 0.05, 30
LIMIT = 300_000
LEDGER = Ledger(Path(__file__).resolve().parent.parent / "engine" / "ledger.jsonl")
# US session in UTC (covers 9:30-16:00 ET across DST); strategy gates entries to 9:30 ET +2h
ENGINE = dict(sessions=(("13:30", "21:00"),), max_hold_min=180, pip=1.0)

VARIANTS = [
    ("idx_breakout_15", {"range_min": 15, "mode": "breakout"}),
    ("idx_breakout_15_retest", {"range_min": 15, "mode": "breakout", "require_retest": True}),
    ("idx_breakout_15_relvol", {"range_min": 15, "mode": "breakout", "use_relvol": True}),
    ("idx_fade_15", {"range_min": 15, "mode": "fade"}),
    ("idx_breakout_30", {"range_min": 30, "mode": "breakout"}),
    ("idx_fade_30", {"range_min": 30, "mode": "fade"}),
]


def _stop_scale(res):
    sl = [-t.net_pips for t in res.trades if t.exit_reason == "sl"]
    return float(np.median(sl)) if sl else (
        float(np.median(np.abs(res.net_pips))) if res.n_trades else 10.0)


async def main():
    df = await load_split_cached(PAIR, "M1", "train", limit=LIMIT)
    spr = ((df["ask_c"] - df["bid_c"]) / 1.0).to_numpy(float)
    spr = spr[np.isfinite(spr) & (spr > 0)]
    cost = float(np.median(spr)) if len(spr) else 1.0
    max_spread = max(3.0, 3 * cost)
    print(f"{PAIR} index-ORB | TRAIN M1 bars={len(df)} | median spread={cost:.2f} pts "
          f"| max_spread_gate={max_spread:.1f} | VAULT sealed\n")

    specs, verdicts = [], []
    for name, vcfg in VARIANTS:
        spec = {"name": name, "family": "index_orb",
                "params": {**vcfg, "target_mult": TARGET_MULT, "open_et": "09:30"},
                "gate": {"cost_pts": round(cost, 2), "min_fold_pos": 0.75,
                         "fdr_alpha": FDR_ALPHA, "min_trades": MIN_TRADES}}
        LEDGER.register(spec); specs.append(spec)
        strat = make_index_orb_strategy({**vcfg, "target_mult": TARGET_MULT})
        res = run(Hypothesis(name, strat, PAIR,
                             engine_kwargs={**ENGINE, "max_spread_pips": max_spread}), df)
        stop = _stop_scale(res)
        cfg = GateConfig(stop_pips=stop, target_pips=TARGET_MULT * stop, cost_pips=cost,
                         min_trades=MIN_TRADES, min_fold_pos=0.75, fdr_alpha=FDR_ALPHA)
        verdicts.append(judge_one(res, cfg, seed=len(verdicts)))

    sig = _bh_significant([v.p_value for v in verdicts], FDR_ALPHA)
    print(f"{'variant':24}{'n':>6}{'win%':>7}{'exp_pts':>9}{'p':>7}{'folds+':>8}{'status':>13}")
    for spec, v, s in zip(specs, verdicts, sig):
        v.significant = bool(s); v.status = _status(v); v.passed = v.status == "PASS"
        print(f"{v.name:24}{v.n_trades:>6}{v.win_rate:>7.3f}{v.expectancy_pips:>9.2f}"
              f"{v.p_value:>7.3f}{v.fold_pos_frac:>8.2f}{v.status:>13}")
        LEDGER.record_result(LEDGER.register(spec), spec,
                             {"split": "train", "status": v.status, "n": v.n_trades,
                              "expectancy_pts": v.expectancy_pips, "p_value": v.p_value})

    n_pass = sum(v.passed for v in verdicts)
    n_inc = sum(v.status == "INCONCLUSIVE" for v in verdicts)
    print(f"\nPASS {n_pass} | INCONCLUSIVE {n_inc} | FAIL {len(verdicts)-n_pass-n_inc}")
    print("NEXT:", "candidate(s) -> validation split" if n_pass
          else ("inconclusive -> review" if n_inc else "none cleared -> index-ORB not supported"))


if __name__ == "__main__":
    asyncio.run(main())
