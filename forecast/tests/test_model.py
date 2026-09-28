import numpy as np
import pandas as pd
import pytest

from forecast.model import ForecastModel, CLASS_NAMES
from forecast.features import FEATURE_COLUMNS


def make_toy_dataset(n=400, seed=0):
    rng = np.random.default_rng(seed)
    X = pd.DataFrame(rng.normal(size=(n, len(FEATURE_COLUMNS))), columns=FEATURE_COLUMNS)
    y = pd.Series(
        np.where(X.iloc[:, 0] > 0.3, 1, np.where(X.iloc[:, 0] < -0.3, -1, 0)),
        dtype="float64",
    )
    return X, y


def test_fit_and_predict_distribution():
    X, y = make_toy_dataset()
    model = ForecastModel(pair="EUR_USD", timeframe="H1", horizon=1)
    model.fit(X, y)

    dist_out = model.predict_distribution(X.iloc[[0]])
    assert set(dist_out["distribution"].keys()) == set(CLASS_NAMES.values())
    assert abs(sum(dist_out["distribution"].values()) - 1.0) < 1e-6
    assert dist_out["predicted_class"] in CLASS_NAMES.values()
    assert 0.0 <= dist_out["confidence"] <= 1.0


def test_save_and_load_latest_roundtrip(tmp_path, monkeypatch):
    import forecast.model as model_mod
    monkeypatch.setattr(model_mod, "MODELS_DIR", tmp_path)

    X, y = make_toy_dataset()
    model = ForecastModel(pair="TEST_PAIR", timeframe="H1", horizon=1)
    model.fit(X, y)
    model.holdout_metrics = {"model_accuracy": 0.5, "naive_baseline_accuracy": 0.4}
    model.save()

    loaded = ForecastModel.load_latest("TEST_PAIR", "H1", horizon=1)
    assert loaded.pair == "TEST_PAIR"
    assert loaded.feature_columns == FEATURE_COLUMNS
    orig_proba = model.predict_proba(X.iloc[:5])
    loaded_proba = loaded.predict_proba(X.iloc[:5])
    assert np.allclose(orig_proba, loaded_proba)


def test_load_latest_missing_raises(tmp_path, monkeypatch):
    import forecast.model as model_mod
    monkeypatch.setattr(model_mod, "MODELS_DIR", tmp_path)
    with pytest.raises(FileNotFoundError):
        ForecastModel.load_latest("NOPE", "H1", horizon=1)