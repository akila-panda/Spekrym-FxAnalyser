"""Thin wrapper around a scikit-learn gradient-boosted classifier, with
versioned save/load and metadata for auditability."""
import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier

from forecast.features import FEATURE_COLUMNS

MODELS_DIR = Path(__file__).parent / "models"

CLASS_NAMES = {-1: "down", 0: "flat", 1: "up"}


@dataclass
class ForecastModel:
    pair: str
    timeframe: str
    horizon: int
    clf: HistGradientBoostingClassifier = field(default=None)
    feature_columns: list = field(default_factory=lambda: list(FEATURE_COLUMNS))
    trained_at: str = None
    train_rows: int = 0
    holdout_metrics: dict = None

    def fit(self, X: pd.DataFrame, y: pd.Series, **params):
        default_params = dict(
            max_iter=300, max_depth=6, learning_rate=0.05,
            l2_regularization=1.0, random_state=42,
        )
        default_params.update(params)
        self.clf = HistGradientBoostingClassifier(**default_params)
        self.clf.fit(X[self.feature_columns], y)
        self.trained_at = datetime.now(timezone.utc).isoformat()
        self.train_rows = len(X)
        return self

    def predict_proba(self, X: pd.DataFrame) -> np.ndarray:
        """Returns array of shape (n, 3), column order = self.clf.classes_."""
        return self.clf.predict_proba(X[self.feature_columns])

    def predict_distribution(self, X_row: pd.DataFrame) -> dict:
        """X_row: single-row feature frame. Returns a probability dict plus
        the model's own class ordering, so callers never have to guess it."""
        proba = self.predict_proba(X_row)[0]
        classes = self.clf.classes_
        dist = {CLASS_NAMES[int(c)]: float(p) for c, p in zip(classes, proba)}
        top_class = int(classes[int(np.argmax(proba))])
        return {
            "distribution": dist,
            "predicted_class": CLASS_NAMES[top_class],
            "confidence": float(np.max(proba)),
        }

    def _version_stem(self) -> str:
        ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        return f"{self.pair}_{self.timeframe}_h{self.horizon}_{ts}"

    def save(self) -> Path:
        MODELS_DIR.mkdir(parents=True, exist_ok=True)
        stem = self._version_stem()
        model_path = MODELS_DIR / f"{stem}.joblib"
        meta_path = MODELS_DIR / f"{stem}.json"

        joblib.dump(self.clf, model_path)
        meta = {
            "pair": self.pair, "timeframe": self.timeframe, "horizon": self.horizon,
            "feature_columns": self.feature_columns, "trained_at": self.trained_at,
            "train_rows": self.train_rows, "holdout_metrics": self.holdout_metrics,
            "model_file": model_path.name,
        }
        meta_path.write_text(json.dumps(meta, indent=2))

        latest_pointer = MODELS_DIR / f"latest_{self.pair}_{self.timeframe}_h{self.horizon}.json"
        latest_pointer.write_text(json.dumps({"stem": stem}, indent=2))
        return model_path

    @classmethod
    def load_latest(cls, pair: str, timeframe: str, horizon: int = 1) -> "ForecastModel":
        pointer_path = MODELS_DIR / f"latest_{pair}_{timeframe}_h{horizon}.json"
        if not pointer_path.exists():
            raise FileNotFoundError(
                f"no trained model for {pair} {timeframe} h={horizon}; "
                f"run `python -m forecast.train` first"
            )
        stem = json.loads(pointer_path.read_text())["stem"]
        meta = json.loads((MODELS_DIR / f"{stem}.json").read_text())
        clf = joblib.load(MODELS_DIR / meta["model_file"])

        return cls(
            pair=pair, timeframe=timeframe, horizon=horizon, clf=clf,
            feature_columns=meta["feature_columns"], trained_at=meta["trained_at"],
            train_rows=meta["train_rows"], holdout_metrics=meta["holdout_metrics"],
        )