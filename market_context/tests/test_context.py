"""Tests for the context assembler and displacement detector."""
import numpy as np
import pandas as pd

from market_context.context import build_context
from market_context.displacement import displacement


def _df(vals, spread=0.1, start="2026-09-01"):
    c = np.array(vals, dtype=float)
    ts = pd.date_range(start, periods=len(c), freq="h", tz="UTC")
    return pd.DataFrame({"ts": ts, "o": c, "h": c + spread, "l": c - spread, "c": c, "v": 1000})


_UP = [10, 11, 12, 11, 10.5, 13, 14, 15, 14, 13.5, 16, 17, 18, 17, 16.5]


def test_displacement_flags_large_candle():
    vals = [1.10] * 20
    df = _df(vals, spread=0.0005)
    df.loc[df.index[-1], ["o", "l"]] = [1.1000, 1.0998]
    df.loc[df.index[-1], ["c", "h"]] = [1.1050, 1.1052]
    d = displacement(df)
    assert d["is_displacement"] is True
    assert d["direction"] == "up"
    assert d["body_atr"] >= 1.5


def test_displacement_quiet_candle():
    df = _df([1.10] * 20, spread=0.0005)
    assert displacement(df)["is_displacement"] is False


def test_build_context_snapshot():
    frames = {"D1": _df(_UP), "H4": _df(_UP), "H1": _df(_UP)}
    ctx = build_context("EUR_USD", frames, entry_tf="H1")
    for k in ("pair", "as_of", "price", "mtf_trends", "mtf_aligned", "structure",
              "levels", "premium_discount", "fvg_active", "liquidity", "displacement"):
        assert k in ctx
    assert ctx["pair"] == "EUR_USD"
    assert set(ctx["mtf_trends"]) == {"D1", "H4", "H1"}
    assert ctx["mtf_trends"]["H1"] == "bullish"
    assert ctx["mtf_aligned"] is True


def test_build_context_handles_empty_entry():
    frames = {"H1": pd.DataFrame(columns=["ts", "o", "h", "l", "c", "v"])}
    ctx = build_context("EUR_USD", frames)
    assert ctx.get("error") == "no_entry_data"
