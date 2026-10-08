"""V0 review gate: the whole engine runs a hypothesis end-to-end —
register (V0.4) → run (V0.2) → judge (V0.3) → log — with the vault (V0.1)
untouched. Synthetic; no DB."""
from engine.runner import Hypothesis, run
from engine.judge import GateConfig, judge_batch
from engine.ledger import Ledger
from engine.tests.test_runner import _frame, _random_strategy


def test_engine_end_to_end(tmp_path):
    led = Ledger(tmp_path / "ledger.jsonl")

    spec = {"name": "null_demo",
            "params": {"target": 6, "stop": 6, "direction": "random"},
            "gate": {"cost_pips": 1.6, "min_fold_pos": 0.75, "fdr_alpha": 0.05}}
    rid = led.register(spec)                       # 1) pre-register + its gate

    hyp = Hypothesis(name=spec["name"], strategy_fn=_random_strategy(seed=3),
                     engine_kwargs=dict(max_spread_pips=3.0, max_hold_min=45))
    result = run(hyp, _frame(n_days=5, spread_pips=1.6))   # 2) run on train-like data

    cfg = GateConfig(stop_pips=6, target_pips=6, cost_pips=1.6, min_trades=20)
    verdict = judge_batch([result], cfg)[0]        # 3) judge

    led.record_result(rid, spec, {"passed": verdict.passed,      # 4) log
                                  "expectancy_pips": verdict.expectancy_pips,
                                  "win_rate": verdict.win_rate})

    logged = led.results()
    assert len(logged) == 1 and logged[0]["id"] == rid
    assert logged[0]["verdict"]["passed"] is False   # a null strategy must not pass
