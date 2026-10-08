"""V0.5 #3/#6 — adversarial checks on the engine + Judge (honestly scoped).

We cannot statically detect look-ahead in arbitrary strategy code, but we CAN
prove the engine never *hands* a strategy future data, never fills at mid-price
(so a cost-cheat is impossible), that slippage really bites, that too-few-trades
is INCONCLUSIVE (not FAIL), and that the vault's frozen spec binds its code/data.
Synthetic; no DB."""
import pandas as pd

from engine.runner import Hypothesis, run
from engine.judge import GateConfig, judge_batch
from engine.ledger import freeze_spec, _hash
from engine.tests.test_runner import _frame, _random_strategy

ENGINE = dict(max_spread_pips=3.0, max_hold_min=30)


def test_engine_passes_only_causal_bars():
    """A spy strategy must never see a bar past 'now' (no future leak)."""
    violations = []

    def spy(ctx):
        last_ts = pd.to_datetime(ctx.m1["ts"].iloc[-1], utc=True)
        if last_ts != pd.to_datetime(ctx.ts, utc=True) or len(ctx.m1) != ctx.k + 1:
            violations.append(ctx.k)
        return None

    run(Hypothesis(name="spy", strategy_fn=spy, engine_kwargs=ENGINE),
        _frame(n_days=2, spread_pips=1.0))
    assert not violations


def _always_long(ctx):
    return {"direction": "long", "tp_pips": 100, "sl_pips": 100}  # exits on time


def test_fills_use_bidask_not_mid_and_slippage_bites():
    # Identical mid path; only the spread/slippage differ, isolating cost.
    zero = run(Hypothesis("al", _always_long, engine_kwargs=ENGINE),
               _frame(n_days=4, spread_pips=0.0, seed=1))
    spread = run(Hypothesis("al", _always_long, engine_kwargs=ENGINE),
                 _frame(n_days=4, spread_pips=1.0, seed=1))
    slipped = run(Hypothesis("al", _always_long,
                             engine_kwargs={**ENGINE, "slippage_pips": 1.0}),
                  _frame(n_days=4, spread_pips=1.0, seed=1))
    assert spread.expectancy_pips < zero.expectancy_pips     # bid/ask applied, not mid
    assert slipped.expectancy_pips < spread.expectancy_pips  # slippage adds cost


def test_insufficient_trades_is_inconclusive_not_fail():
    frame = _frame(n_days=3, spread_pips=1.6)
    res = run(Hypothesis("rnd", _random_strategy(seed=5), engine_kwargs=ENGINE), frame)
    cfg = GateConfig(stop_pips=6, target_pips=6, min_trades=10_000)  # unreachable
    v = judge_batch([res], cfg)[0]
    assert v.status == "INCONCLUSIVE" and not v.passed


def test_frozen_spec_binds_code_and_data():
    base = {"name": "orb", "params": {"range_min": 15}, "gate": {"cost_pips": 1.6}}
    a = _hash(freeze_spec(base, code_commit="aaa", data_snapshot="d1", cost_model_version="c1"))
    b = _hash(freeze_spec(base, code_commit="bbb", data_snapshot="d1", cost_model_version="c1"))
    c = _hash(freeze_spec(base, code_commit="aaa", data_snapshot="d2", cost_model_version="c1"))
    assert a != b and a != c                           # any env change → new id
