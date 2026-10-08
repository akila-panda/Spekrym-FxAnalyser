"""Data manifest: what candle data we have, per (instrument, tf). JSON source of truth."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

PATH = Path(__file__).resolve().parent / "manifest.json"


def load() -> dict:
    return json.loads(PATH.read_text()) if PATH.exists() else {}


def record(instrument: str, tf: str, rows: int, start: str, end: str, qa: str) -> None:
    m = load()
    m.setdefault(instrument, {})[tf] = {
        "rows": rows, "start": start, "end": end, "qa": qa,
        "updated": datetime.now(timezone.utc).isoformat()}
    PATH.write_text(json.dumps(m, indent=2, sort_keys=True))
