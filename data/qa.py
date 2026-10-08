"""Candle QA: dedupe / monotonic / gap / count checks before data is used."""
from __future__ import annotations

import pandas as pd

_TF_MIN = {"M1": 1, "M5": 5, "M15": 15, "H1": 60, "H4": 240, "D": 1440, "W": 10080}
_MIN_ROWS = {"M1": 50_000, "M5": 10_000, "M15": 4_000, "H1": 1_000,
             "H4": 300, "D": 100, "W": 20}


def check(df: pd.DataFrame, tf: str) -> dict:
    if df is None or df.empty:
        return {"rows": 0, "dups": 0, "monotonic": False, "max_gap_min": None, "status": "FAIL"}
    ts = pd.to_datetime(df["ts"], utc=True)
    rows = len(df)
    dups = int(ts.duplicated().sum())
    monotonic = bool(ts.is_monotonic_increasing)
    gaps = ts.diff().dt.total_seconds().div(60).dropna()
    max_gap = float(gaps.max()) if len(gaps) else 0.0
    ok = dups == 0 and monotonic and rows >= _MIN_ROWS.get(tf, 20)
    return {"rows": rows, "dups": dups, "monotonic": monotonic,
            "max_gap_min": round(max_gap, 1), "status": "PASS" if ok else "FAIL"}
