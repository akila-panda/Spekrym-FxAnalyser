"""Append-only audit log of coordinator decisions.

Every recommendation -- including each agent's raw verdict and the gates fired
-- is written as one JSON line, satisfying 03-agents.md's requirement that the
full reasoning trail be logged and auditable after the fact (and later
back-scored: did high-confidence recommendations actually work out?).
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

LOG_DIR = Path(__file__).resolve().parent.parent / "agent_workspace" / "logs"
DECISION_LOG = LOG_DIR / "decisions.jsonl"


def log_decision(recommendation: dict, path: Path | None = None) -> Path:
    """Append one recommendation dict (from Recommendation.to_dict()) to the
    JSON-lines audit log. Creates the log directory if needed."""
    path = path or DECISION_LOG
    path.parent.mkdir(parents=True, exist_ok=True)
    entry = {"logged_at": datetime.now(timezone.utc).isoformat(), **recommendation}
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(entry) + "\n")
    return path


def read_decisions(path: Path | None = None, limit: int | None = None) -> list[dict]:
    """Read decisions back (most recent last). Returns [] if the log is absent."""
    path = path or DECISION_LOG
    if not path.exists():
        return []
    lines = path.read_text(encoding="utf-8").splitlines()
    if limit is not None:
        lines = lines[-limit:]
    out = []
    for line in lines:
        line = line.strip()
        if not line:
            continue
        try:
            out.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return out
