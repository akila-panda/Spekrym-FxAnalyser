"""V0.1 — chronological data partition + locked holdout vault.

Splits a pair/timeframe's candles chronologically into TRAIN / VALID / VAULT.
The search may read TRAIN and VALID freely. The VAULT (most-recent slice) is
guarded: it can only be read via `load_vault(..., final_confirmation=True)`,
and every consultation is counted and logged to `engine/vault_access.json`,
because each look at the holdout burns its credibility (roadmap §0, V0.1).
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

from ta_engine.loader import load_candles

# Chronological fractions; must be contiguous and cover [0, 1].
SPLITS = {"train": (0.0, 0.6), "valid": (0.6, 0.8), "vault": (0.8, 1.0)}
_VAULT_LOG = Path(__file__).parent / "vault_access.json"


def partition_frame(df: pd.DataFrame, split: str) -> pd.DataFrame:
    """Return the chronological slice for `split` (df must be ascending by ts)."""
    if split not in SPLITS:
        raise ValueError(f"unknown split {split!r}; expected one of {list(SPLITS)}")
    n = len(df)
    lo, hi = SPLITS[split]
    return df.iloc[int(n * lo):int(n * hi)].reset_index(drop=True)


async def load_split(pair: str, timeframe: str = "M1", split: str = "train",
                     limit: int = 200_000) -> pd.DataFrame:
    """Load TRAIN or VALID. Refuses VAULT — use `load_vault` for that, so the
    holdout can never be read through the ordinary search path."""
    if split == "vault":
        raise PermissionError(
            "vault is locked; call load_vault(..., final_confirmation=True)")
    df = await load_candles(pair, timeframe, limit=limit)
    return partition_frame(df, split)


def _record_access(pair: str, timeframe: str, reason: str) -> int:
    state = {"consultations": 0, "log": []}
    if _VAULT_LOG.exists():
        state = json.loads(_VAULT_LOG.read_text())
    state["consultations"] += 1
    state["log"].append({"ts": datetime.now(timezone.utc).isoformat(),
                         "pair": pair, "tf": timeframe, "reason": reason})
    _VAULT_LOG.write_text(json.dumps(state, indent=2))
    return state["consultations"]


async def load_vault(pair: str, timeframe: str = "M1", *, reason: str,
                     final_confirmation: bool = False,
                     limit: int = 200_000) -> pd.DataFrame:
    """Load the locked holdout. Raises unless `final_confirmation=True`. Every
    successful call is counted+logged; the returned frame carries the running
    consultation count in `df.attrs['vault_consultations']` so the Judge can
    factor holdout wear into its verdict."""
    if not final_confirmation:
        raise PermissionError(
            "VAULT is locked. Pass final_confirmation=True only for a genuine "
            "final test — every read burns holdout credibility (roadmap §0).")
    count = _record_access(pair, timeframe, reason)
    df = await load_candles(pair, timeframe, limit=limit)
    out = partition_frame(df, "vault")
    out.attrs["vault_consultations"] = count
    return out


def vault_consultations() -> int:
    if not _VAULT_LOG.exists():
        return 0
    return json.loads(_VAULT_LOG.read_text()).get("consultations", 0)
