"""Strategy driven by the Phase 3 forecasting model: trades in the direction
of the predicted class when the model's confidence clears a threshold.

Requires a trained model (run `python -m forecast.train` first) -- returns
None (no signal) for every bar until one exists, so it fails safe rather
than erroring the whole backtest run.
"""
import pandas as pd

from forecast.predict import predict_from_window

MIN_CANDLES = 260  # covers the feature warmup (sma50 rolling window, etc.)
CONFIDENCE_THRESHOLD = 0.45


def make_strategy(pair: str, timeframe: str = "H1", horizon: int = 1,
                   confidence_threshold: float = CONFIDENCE_THRESHOLD):
    """Returns a strategy_fn closure bound to a specific pair/model, matching
    the engine's `Callable[[pd.DataFrame], Optional[dict]]` signature."""

    def strategy_fn(window_df: pd.DataFrame):
        if len(window_df) < MIN_CANDLES:
            return None

        forecast = predict_from_window(window_df, pair, timeframe, horizon)
        if forecast is None:
            return None

        predicted = forecast["predicted_class"]
        confidence = forecast["confidence"]
        if predicted == "flat" or confidence < confidence_threshold:
            return None

        return {
            "direction": "long" if predicted == "up" else "short",
            "reason": f"forecast_{predicted}@conf={confidence:.2f}",
        }

    return strategy_fn