"""V0.1 gate: the vault is unreadable via the normal path, and the chronological
split is correct, contiguous, and non-overlapping. Pure/synthetic — no DB."""
import asyncio

import pandas as pd
import pytest

from engine import partition as P


def _df(n=1000):
    ts = pd.date_range("2024-01-01", periods=n, freq="min", tz="UTC")
    return pd.DataFrame({"ts": ts, "o": range(n), "h": range(n),
                         "l": range(n), "c": range(n), "v": [1] * n})


def test_splits_cover_and_are_contiguous():
    df = _df(1000)
    tr = P.partition_frame(df, "train")
    va = P.partition_frame(df, "valid")
    vt = P.partition_frame(df, "vault")
    assert len(tr) + len(va) + len(vt) == len(df)          # cover
    assert tr["ts"].max() < va["ts"].min() < vt["ts"].min()  # chronological, ordered
    assert len(tr) == 600 and len(va) == 200 and len(vt) == 200


def test_partition_frame_rejects_unknown_split():
    with pytest.raises(ValueError):
        P.partition_frame(_df(10), "holdout")


def test_load_split_refuses_vault():
    with pytest.raises(PermissionError):
        asyncio.run(P.load_split("EUR_USD", "M1", "vault"))


def test_load_vault_requires_final_confirmation(monkeypatch, tmp_path):
    monkeypatch.setattr(P, "_VAULT_LOG", tmp_path / "vault_access.json")
    with pytest.raises(PermissionError):
        asyncio.run(P.load_vault("EUR_USD", "M1", reason="test"))
    assert P.vault_consultations() == 0  # a refused read is never counted


def test_load_vault_counts_and_logs(monkeypatch, tmp_path):
    log = tmp_path / "vault_access.json"
    monkeypatch.setattr(P, "_VAULT_LOG", log)

    async def fake_load(pair, tf, limit):
        return _df(1000)
    monkeypatch.setattr(P, "load_candles", fake_load)

    out = asyncio.run(P.load_vault("EUR_USD", "M1", reason="V1 final",
                                   final_confirmation=True))
    assert len(out) == 200
    assert out.attrs["vault_consultations"] == 1
    assert P.vault_consultations() == 1
    # a second genuine consultation increments the counter (credibility burns)
    asyncio.run(P.load_vault("EUR_USD", "M1", reason="again",
                             final_confirmation=True))
    assert P.vault_consultations() == 2
