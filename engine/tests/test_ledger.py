"""V0.4 gate: pre-registration is immutable and post-hoc gate edits are rejected.
Ledger written to tmp_path; no DB."""
import pytest

from engine.ledger import Ledger, _hash

SPEC = {"name": "orb_london_15", "params": {"range_min": 15, "target": 30, "stop": 15},
        "gate": {"cost_pips": 1.6, "min_fold_pos": 0.75, "fdr_alpha": 0.05}}


def test_register_is_stable_and_idempotent(tmp_path):
    led = Ledger(tmp_path / "ledger.jsonl")
    a = led.register(SPEC)
    b = led.register(dict(SPEC))          # identical spec
    assert a == b
    assert led.experiment_count() == 1    # no duplicate registration record


def test_changing_gate_changes_id(tmp_path):
    led = Ledger(tmp_path / "ledger.jsonl")
    rid = led.register(SPEC)
    tampered = {**SPEC, "gate": {**SPEC["gate"], "fdr_alpha": 0.20}}  # looser gate
    assert led.register(tampered) != rid
    assert led.experiment_count() == 2


def test_result_rejects_posthoc_gate_edit(tmp_path):
    led = Ledger(tmp_path / "ledger.jsonl")
    rid = led.register(SPEC)
    edited = {**SPEC, "gate": {**SPEC["gate"], "fdr_alpha": 0.20}}
    with pytest.raises(ValueError):                # gate moved after registration
        led.record_result(rid, edited, {"passed": True})


def test_result_requires_registration(tmp_path):
    led = Ledger(tmp_path / "ledger.jsonl")
    other = {**SPEC, "name": "never_registered"}   # valid hash, but not registered
    with pytest.raises(KeyError):
        led.record_result(_hash(other), other, {"passed": True})


def test_result_records_and_persists(tmp_path):
    path = tmp_path / "ledger.jsonl"
    led = Ledger(path)
    rid = led.register(SPEC)
    led.record_result(rid, SPEC, {"passed": False, "expectancy_pips": -2.1})
    # a fresh instance reads the same append-only file
    reloaded = Ledger(path)
    res = reloaded.results()
    assert len(res) == 1
    assert res[0]["id"] == rid
    assert res[0]["experiment_count"] == 1
    assert res[0]["verdict"]["passed"] is False
