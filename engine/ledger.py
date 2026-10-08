"""V0.4 — Registrar + append-only ledger.

Every hypothesis is registered *with its gate* BEFORE it runs. The registration
id is the SHA-256 of the canonical spec (params + gate), so the id itself encodes
the gate: change the gate and you get a different id. A result can only be
appended against a registration whose spec still hashes to that id — so a
post-hoc edit of the gate is detected and rejected (roadmap §0, V0.4).

The ledger is append-only by construction (records are only ever appended, never
rewritten), which is why "no moving the goalposts" is enforced mechanically
rather than by discipline.
"""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path


def _hash(spec: dict) -> str:
    canon = json.dumps(spec, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canon.encode()).hexdigest()[:16]


def freeze_spec(spec: dict, *, code_commit: str, data_snapshot: str,
                cost_model_version: str) -> dict:
    """V0.5 #5 — bind a strategy spec to the exact code, data and cost model it
    was validated against before a VAULT run. Any later change to the code
    commit, data snapshot or cost model changes the id, so the vault runner
    (which accepts only this frozen spec's id) can never be fed a silently
    altered strategy. Returns a new spec; hash it with `register` to get the id."""
    return {**spec, "_freeze": {"code_commit": code_commit,
                                "data_snapshot": data_snapshot,
                                "cost_model_version": cost_model_version}}


class Ledger:
    def __init__(self, path: str | Path):
        self.path = Path(path)

    # ---- append-only primitive ----
    def _append(self, rec: dict) -> None:
        with self.path.open("a") as f:            # append mode only, never rewrite
            f.write(json.dumps(rec) + "\n")

    def _records(self) -> list[dict]:
        if not self.path.exists():
            return []
        return [json.loads(line) for line in self.path.read_text().splitlines() if line]

    # ---- registrations ----
    def registrations(self) -> dict:
        return {r["id"]: r["spec"] for r in self._records() if r["kind"] == "register"}

    def experiment_count(self) -> int:
        return sum(1 for r in self._records() if r["kind"] == "register")

    def register(self, spec: dict) -> str:
        """Pre-register a hypothesis+gate. Idempotent: re-registering the identical
        spec returns the same id without a duplicate record."""
        rid = _hash(spec)
        if rid not in self.registrations():
            self._append({"kind": "register", "id": rid,
                          "ts": datetime.now(timezone.utc).isoformat(), "spec": spec})
        return rid

    # ---- results ----
    def record_result(self, rid: str, spec: dict, verdict: dict) -> None:
        """Append a result for a registered hypothesis. Rejects an unregistered id
        and rejects a spec whose gate/params were edited after registration."""
        if _hash(spec) != rid:
            raise ValueError(
                "spec no longer hashes to its registration id — gate/params were "
                "edited after registration (post-hoc goalpost move rejected)")
        if rid not in self.registrations():
            raise KeyError(f"{rid} was never registered; register before running")
        self._append({"kind": "result", "id": rid,
                      "ts": datetime.now(timezone.utc).isoformat(),
                      "experiment_count": self.experiment_count(),
                      "verdict": verdict})

    def results(self) -> list[dict]:
        return [r for r in self._records() if r["kind"] == "result"]
