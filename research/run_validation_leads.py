"""Confirmation of the two V1.5 leads on the UNTOUCHED VALIDATION split.

Runs `fade_london_15m` and `mom_london_30m` exactly as registered — identical
params, sessions, cost/slippage, and the already-locked V0.5 Judge + gates (no
changes, no reinterpretation). Prints TRAIN vs VALIDATION diagnostics side by
side for comparability and records the Judge's verdict. The VAULT is never
loaded. Run: python -m research.run_validation_leads
"""
import asyncio
from pathlib import Path

import numpy as np

from engine.datacache import load_split_cached
from engine.ledger import Ledger
from engine.runner import Hypothesis, run
from engine.judge import GateConfig, judge_one, _bh_significant, _status
from market_context.orb_strategy import make_orb_strategy
from market_context.momentum_strategy import make_session_momentum_strategy

PAIR, COST_PIPS, FDR_ALPHA, MIN_TRADES, TARGET_MULT = "EUR_USD", 1.6, 0.05, 30, 1.5
LEDGER = Ledger(Path(__file__).resolve().parent.parent / "engine" / "ledger.jsonl")

# the two registered leads, EXACTLY as in run_v15_batch
LEADS = [
    {"name": "fade_london_15m", "fixed_stop": None,
     "spec": {"name": "fade_london_15m", "family": "orb_fade",
              "params": {"session_open": "07:00", "range_min": 15,
                         "target_mult": TARGET_MULT, "mode": "fade"},
              "gate": {"cost_pips": COST_PIPS, "min_fold_pos": 0.75,
                       "fdr_alpha": FDR_ALPHA, "min_trades": MIN_TRADES,
                       "target_mult": TARGET_MULT}},
     "strat": make_orb_strategy({"session_open": "07:00", "range_min": 15,
                                 "mode": "fade", "target_mult": TARGET_MULT}),
     "engine": dict(sessions=(("07:00", "16:00"),), max_spread_pips=2.0, max_hold_min=300)},
    {"name": "mom_london_30m", "fixed_stop": 30.0,
     "spec": {"name": "mom_london_30m", "family": "session_momentum",
              "params": {"session_open": "07:00", "signal_min": 30,
                         "sl_pips": 30, "tp_pips": 30},
              "gate": {"cost_pips": COST_PIPS, "min_fold_pos": 0.75,
                       "fdr_alpha": FDR_ALPHA, "min_trades": MIN_TRADES,
                       "sl_pips": 30, "tp_pips": 30}},
     "strat": make_session_momentum_strategy({"session_open": "07:00", "signal_min": 30}),
     "engine": dict(sessions=(("07:00", "16:00"),), max_spread_pips=2.0, max_hold_min=600)},
]


def _diag(res):
    tr, pips = res.trades, res.net_pips
    if res.n_trades == 0:
        return {"n": 0}
    wins, losses = pips[pips > 0], pips[pips <= 0]
    spread = np.array([t.spread_at_entry for t in tr])
    longs = [t.net_pips for t in tr if t.direction == "long"]
    shorts = [t.net_pips for t in tr if t.direction == "short"]
    order = np.sort(pips)[::-1]
    cum = np.cumsum(pips)
    max_dd = float((np.maximum.accumulate(cum) - cum).max())
    conc = {k: float((pips.sum() - order[:k].sum()) / (len(pips) - k)) for k in (1, 3, 5)}
    folds = [float(c.mean()) for c in np.array_split(pips, 4)]
    return {"n": len(tr), "win": float((pips > 0).mean()), "exp": float(pips.mean()),
            "median": float(np.median(pips)),
            "avg_win": float(wins.mean()) if len(wins) else 0.0,
            "avg_loss": float(losses.mean()) if len(losses) else 0.0,
            "gross": float(pips.mean() + spread.mean()), "spread": float(spread.mean()),
            "long": (len(longs), float(np.mean(longs)) if longs else 0.0),
            "short": (len(shorts), float(np.mean(shorts)) if shorts else 0.0),
            "conc": conc, "folds": folds, "max_dd": max_dd}


def _cfg(res, fixed):
    if fixed is not None:
        stop = fixed
    else:
        sl = [-t.net_pips for t in res.trades if t.exit_reason == "sl"]
        stop = float(np.median(sl)) if sl else 10.0
    return GateConfig(stop_pips=stop, target_pips=TARGET_MULT * stop, cost_pips=COST_PIPS,
                      min_trades=MIN_TRADES, min_fold_pos=0.75, fdr_alpha=FDR_ALPHA)


def _show(name, tr_d, va_d):
    print(f"\n=== {name} ===")
    print(f"{'metric':16}{'TRAIN':>12}{'VALIDATION':>14}")
    rows = [("n", "n"), ("win_rate", "win"), ("net_exp_pips", "exp"), ("median", "median"),
            ("avg_win", "avg_win"), ("avg_loss", "avg_loss"),
            ("gross_pips", "gross"), ("spread", "spread"), ("max_dd", "max_dd")]
    for label, key in rows:
        t = tr_d.get(key, 0.0); v = va_d.get(key, 0.0)
        print(f"{label:16}{t:>12.3f}{v:>14.3f}")
    for side in ("long", "short"):
        tn, te = tr_d.get(side, (0, 0.0)); vn, ve = va_d.get(side, (0, 0.0))
        print(f"{side+'_exp':16}{te:>12.3f}{ve:>14.3f}   (n {tn} / {vn})")
    for k in (1, 3, 5):
        t = tr_d.get("conc", {}).get(k, 0.0); v = va_d.get("conc", {}).get(k, 0.0)
        print(f"{'exp_wo_top'+str(k):16}{t:>12.3f}{v:>14.3f}")
    print(f"{'folds TRAIN':16}{str([round(x,2) for x in tr_d.get('folds',[])])}")
    print(f"{'folds VALID':16}{str([round(x,2) for x in va_d.get('folds',[])])}")


async def main():
    train = await load_split_cached(PAIR, "M1", "train", limit=200_000)
    valid = await load_split_cached(PAIR, "M1", "valid", limit=200_000)   # untouched
    print(f"{PAIR} VALIDATION confirmation | train={len(train)} valid={len(valid)} "
          f"| VAULT sealed")

    val_verdicts = []
    for lead in LEADS:
        hyp = Hypothesis(lead["name"], lead["strat"], PAIR, engine_kwargs=lead["engine"])
        tr_res = run(hyp, train)
        va_res = run(hyp, valid)
        _show(lead["name"], _diag(tr_res), _diag(va_res))
        val_verdicts.append(judge_one(va_res, _cfg(va_res, lead["fixed_stop"]),
                                      seed=len(val_verdicts)))

    sig = _bh_significant([v.p_value for v in val_verdicts], FDR_ALPHA)
    print("\n--- VALIDATION VERDICT (locked V0.5 Judge) ---")
    for lead, v, s in zip(LEADS, val_verdicts, sig):
        v.significant = bool(s); v.status = _status(v); v.passed = v.status == "PASS"
        print(f"  {lead['name']:18} n={v.n_trades:3d} exp={v.expectancy_pips:+.3f} "
              f"p={v.p_value:.3f} folds+={v.fold_pos_frac:.2f}  -> {v.status}")
        LEDGER.record_result(LEDGER.register(lead["spec"]), lead["spec"],
                             {"split": "validation", "status": v.status,
                              "n": v.n_trades, "expectancy_pips": v.expectancy_pips,
                              "p_value": v.p_value})

    print("\nVAULT remains sealed. Next step follows the pre-existing protocol only.")


if __name__ == "__main__":
    asyncio.run(main())
