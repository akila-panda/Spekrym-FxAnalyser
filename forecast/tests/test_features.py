import numpy as np
import pandas as pd
import pytest

from forecast.features import build_feature_frame, make_labels, build_dataset, FEATURE_COLUMNS


def make_trending_df(n=300, start=1.1000, drift=0.0001, noise=0.0002, seed=3):
    rng = np.random.default_rng(seed)
    closes = start + np.cumsum(rng.normal(drift, noise, n))
    o = closes - rng.normal(0, noise / 2, n)
    h = np.maximum(o, closes) + np.abs(rng.normal(0, noise, n))
    l = np.minimum(o, closes) - np.abs(rng.normal(0, noise, n))
    v = rng.integers(100, 1000, n)
    df = pd.DataFrame({"o": o, "h": h, "l": l, "c": closes, "v": v})
    df["ts"] = pd.date_range("2026-01-01", periods=n, freq="h", tz="UTC")
    return df


def test_build_feature_frame_shape():
    df = make_trending_df()
    feat = build_feature_frame(df)
    assert list(feat.columns) == FEATURE_COLUMNS
    assert len(feat) == len(df)
    assert feat.tail(50).notna().all().all()


def test_make_labels_classes_and_tail_nan():
    df = make_trending_df()
    labels = make_labels(df, horizon=1)
    assert set(labels.dropna().unique()) <= {-1.0, 0.0, 1.0}
    assert labels.iloc[-1:].isna().all()


def test_strong_uptrend_produces_up_labels():
    df = make_trending_df(drift=0.002, noise=0.00005, n=200)
    labels = make_labels(df, horizon=1, atr_mult=0.1)
    valid = labels.dropna()
    assert (valid == 1).mean() > 0.5


def test_build_dataset_alignment_and_no_nans():
    df = make_trending_df()
    X, y = build_dataset(df, horizon=1)
    assert len(X) == len(y)
    assert X.notna().all().all()
    assert y.notna().all()
    assert len(X) < len(df)