"""Retraining job for the forecasting model.

Run directly for a one-off train of all pairs:
    python -m forecast.train
Or a single pair:
    python -m forecast.train --pairs EUR_USD

To run on a schedule, wire `train_all` into the project's existing
apscheduler setup (see data/scheduler.py for the established pattern) --
kept as a plain async function here so it composes with that job runner
rather than duplicating a second scheduling mechanism.
"""
import argparse
import asyncio
import logging

import numpy as np
import pandas as pd
from sklearn.metrics import accuracy_score, log_loss

from forecast.features import build_dataset
from forecast.model import ForecastModel
from ta_engine.loader import load_candles

logger = logging.getLogger("forecast.train")

HOLDOUT_FRACTION = 0.2


def _naive_baseline_accuracy(y: pd.Series) -> float:
    """Persistence/majority-class baseline -- the floor any real model must
    beat. In practice 'flat' dominates FX H1 return distributions once an
    ATR-scaled noise threshold is applied, so this is a non-trivial floor,
    not a strawman."""
    majority = y.mode().iloc[0]
    return float((y == majority).mean())


def _time_split(X: pd.DataFrame, y: pd.Series, holdout_fraction: float):
    """No shuffling -- a random split would leak future info into training,
    since adjacent H1 candles are highly autocorrelated."""
    n = len(X)
    split = int(n * (1 - holdout_fraction))
    return X.iloc[:split], X.iloc[split:], y.iloc[:split], y.iloc[split:]


async def train_pair(pair: str, timeframe: str = "H1", horizon: int = 1,
                      candle_limit: int = 15000, atr_mult: float = 0.25) -> ForecastModel:
    logger.info("loading candles for %s %s", pair, timeframe)
    df = await load_candles(pair, timeframe, limit=candle_limit)
    if len(df) < 500:
        raise ValueError(f"not enough candles to train ({len(df)}); backfill more history first")

    X, y = build_dataset(df, horizon=horizon, atr_mult=atr_mult)
    X_train, X_test, y_train, y_test = _time_split(X, y, HOLDOUT_FRACTION)

    model = ForecastModel(pair=pair, timeframe=timeframe, horizon=horizon)
    model.fit(X_train, y_train)

    proba_test = model.predict_proba(X_test)
    pred_test = model.clf.classes_[np.argmax(proba_test, axis=1)]

    baseline_acc = _naive_baseline_accuracy(y_test)
    model_acc = accuracy_score(y_test, pred_test)
    try:
        model_logloss = log_loss(y_test, proba_test, labels=model.clf.classes_)
    except ValueError:
        model_logloss = None

    model.holdout_metrics = {
        "holdout_rows": len(X_test),
        "naive_baseline_accuracy": round(baseline_acc, 4),
        "model_accuracy": round(model_acc, 4),
        "edge_over_baseline": round(model_acc - baseline_acc, 4),
        "log_loss": round(model_logloss, 4) if model_logloss is not None else None,
    }
    logger.info("holdout: model_acc=%.4f baseline_acc=%.4f edge=%+.4f",
                model_acc, baseline_acc, model_acc - baseline_acc)

    path = model.save()
    logger.info("saved model to %s", path)
    return model


async def train_all(pairs: list, timeframe: str = "H1", horizon: int = 1):
    for pair in pairs:
        try:
            await train_pair(pair, timeframe, horizon)
        except Exception:
            logger.exception("training failed for %s", pair)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    parser = argparse.ArgumentParser()
    parser.add_argument("--pairs", nargs="+",
                         default=["EUR_USD", "GBP_USD", "USD_JPY", "AUD_USD", "USD_CAD"])
    parser.add_argument("--timeframe", default="H1")
    parser.add_argument("--horizon", type=int, default=1)
    args = parser.parse_args()
    asyncio.run(train_all(args.pairs, args.timeframe, args.horizon))