"""Prediction interface: a sync core (usable inside the backtest engine's
per-bar loop, which calls strategy_fn synchronously) plus a thin async
wrapper for live use that pulls fresh candles from the DB."""
import json

import pandas as pd

from forecast.features import build_feature_frame
from forecast.model import ForecastModel, MODELS_DIR
from ta_engine.loader import load_candles

_MODEL_CACHE = {}
_CACHE_STEMS = {}


def _current_pointer_stem(pair: str, timeframe: str, horizon: int) -> str | None:
    """Read the tiny `latest_*.json` pointer to learn which model version is
    current on disk, without loading the model itself. Returns None if no
    pointer exists yet."""
    pointer = MODELS_DIR / f"latest_{pair}_{timeframe}_h{horizon}.json"
    if not pointer.exists():
        return None
    try:
        return json.loads(pointer.read_text())["stem"]
    except (json.JSONDecodeError, KeyError, OSError):
        return None


def clear_model_cache():
    """Drop all cached models. Call after a retrain in a long-running process."""
    _MODEL_CACHE.clear()
    _CACHE_STEMS.clear()


def _get_cached_model(pair: str, timeframe: str, horizon: int,
                      check_fresh: bool = False) -> ForecastModel:
    key = (pair, timeframe, horizon)
    if check_fresh and key in _MODEL_CACHE:
        # cheap pointer read; evict if a newer model has been trained on disk
        current = _current_pointer_stem(pair, timeframe, horizon)
        if current is not None and current != _CACHE_STEMS.get(key):
            del _MODEL_CACHE[key]
    if key not in _MODEL_CACHE:
        _MODEL_CACHE[key] = ForecastModel.load_latest(pair, timeframe, horizon)
        _CACHE_STEMS[key] = _current_pointer_stem(pair, timeframe, horizon)
    return _MODEL_CACHE[key]


def predict_from_window(window_df: pd.DataFrame, pair: str, timeframe: str = "H1",
                         horizon: int = 1):
    """window_df: causal OHLCV slice ending at the current (just-closed) candle.
    Returns None if there isn't enough history to compute features, or if no
    trained model exists yet for this pair/timeframe/horizon -- fails safe
    rather than raising, so a missing model just means "no signal" to a
    caller like the backtest engine.
    """
    try:
        model = _get_cached_model(pair, timeframe, horizon)
    except FileNotFoundError:
        return None

    feat = build_feature_frame(window_df)
    last_row = feat.tail(1)
    if last_row.isna().any(axis=1).iloc[0]:
        return None  # not enough warmup history in this window yet

    return model.predict_distribution(last_row)


async def get_latest_forecast(pair: str, timeframe: str = "H1", horizon: int = 1,
                               candle_limit: int = 500) -> dict:
    """Live-use entry point: loads recent candles from the DB and returns a
    forecast dict, matching the architecture doc's 'probability distribution
    output' shape rather than a single point prediction."""
    # live path: pick up a newer model if one was trained since we last loaded
    try:
        _get_cached_model(pair, timeframe, horizon, check_fresh=True)
    except FileNotFoundError:
        pass
    df = await load_candles(pair, timeframe, limit=candle_limit)
    result = predict_from_window(df, pair, timeframe, horizon)
    if result is None:
        return {"pair": pair, "timeframe": timeframe, "horizon": horizon,
                "error": "no_model_or_insufficient_data"}
    result.update({"pair": pair, "timeframe": timeframe, "horizon": horizon})
    return result