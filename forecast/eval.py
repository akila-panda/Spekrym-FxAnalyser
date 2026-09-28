"""Rolling walk-forward accuracy tracker.

Retrains on an expanding window at each step and evaluates on the next
block of unseen candles, so the reported accuracy reflects how the model
would have performed if retrained on a schedule over time -- not a single
lucky/unlucky train/test split. This is what the dashboard's live-updating
"out-of-sample accuracy" panel (Phase 5) will eventually read from.
"""
import asyncio
import json
import logging
from pathlib import Path

import numpy as np
from sklearn.metrics import accuracy_score

from forecast.features import build_dataset
from forecast.model import ForecastModel
from forecast.train import _naive_baseline_accuracy
from ta_engine.loader import load_candles

logger = logging.getLogger("forecast.eval")
RESULTS_DIR = Path(__file__).parent / "results"


async def walk_forward_eval(pair: str, timeframe: str = "H1", horizon: int = 1,
                             candle_limit: int = 15000, n_folds: int = 5,
                             min_train_fraction: float = 0.5) -> dict:
    df = await load_candles(pair, timeframe, limit=candle_limit)
    X, y = build_dataset(df, horizon=horizon)
    n = len(X)
    min_train = int(n * min_train_fraction)
    fold_size = (n - min_train) // n_folds
    if fold_size <= 0:
        raise ValueError("not enough data for the requested number of folds")

    folds = []
    for i in range(n_folds):
        train_end = min_train + i * fold_size
        test_end = min(train_end + fold_size, n)
        if test_end <= train_end:
            break

        X_train, y_train = X.iloc[:train_end], y.iloc[:train_end]
        X_test, y_test = X.iloc[train_end:test_end], y.iloc[train_end:test_end]

        model = ForecastModel(pair=pair, timeframe=timeframe, horizon=horizon)
        model.fit(X_train, y_train)
        proba = model.predict_proba(X_test)
        pred = model.clf.classes_[np.argmax(proba, axis=1)]

        model_acc = accuracy_score(y_test, pred)
        baseline_acc = _naive_baseline_accuracy(y_test)
        folds.append({
            "fold": i, "train_rows": len(X_train), "test_rows": len(X_test),
            "model_accuracy": round(model_acc, 4),
            "naive_baseline_accuracy": round(baseline_acc, 4),
            "edge": round(model_acc - baseline_acc, 4),
        })
        logger.info("fold %d: model=%.4f baseline=%.4f edge=%+.4f",
                    i, model_acc, baseline_acc, model_acc - baseline_acc)

    report = {
        "pair": pair, "timeframe": timeframe, "horizon": horizon,
        "n_folds": len(folds), "folds": folds,
        "mean_model_accuracy": round(float(np.mean([f["model_accuracy"] for f in folds])), 4) if folds else None,
        "mean_baseline_accuracy": round(float(np.mean([f["naive_baseline_accuracy"] for f in folds])), 4) if folds else None,
        "mean_edge": round(float(np.mean([f["edge"] for f in folds])), 4) if folds else None,
    }

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    out_path = RESULTS_DIR / f"walkforward_{pair}_{timeframe}_h{horizon}.json"
    out_path.write_text(json.dumps(report, indent=2))
    logger.info("mean edge over baseline: %+.4f -> %s", report["mean_edge"], out_path)
    return report


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(walk_forward_eval("EUR_USD"))