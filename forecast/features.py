"""Feature engineering for the forecasting model.

Builds a per-row feature matrix from raw OHLCV candles. No look-ahead: each
row's features only use data up to and including that row's own candle.
"""
import numpy as np
import pandas as pd
from ta.momentum import RSIIndicator
from ta.trend import MACD, SMAIndicator, EMAIndicator
from ta.volatility import AverageTrueRange, BollingerBands

FEATURE_COLUMNS = [
    "ret_1", "ret_3", "ret_6", "ret_12", "ret_24",
    "rsi14", "macd_hist_norm",
    "atr14_norm", "atr_regime",
    "bb_pct", "bb_width_norm",
    "sma20_slope", "sma50_slope", "ema20_dist_norm",
    "vol_zscore",
    "hour_sin", "hour_cos", "dow_sin", "dow_cos",
]


def build_feature_frame(df: pd.DataFrame) -> pd.DataFrame:
    """df: OHLCV with columns [ts, o, h, l, c, v], ascending by ts.
    Returns a frame indexed the same as df, with FEATURE_COLUMNS populated.
    Leading rows without enough history are NaN and should be dropped by the
    caller (see `build_dataset`).
    """
    close, high, low, vol = df["c"], df["h"], df["l"], df["v"]

    feat = pd.DataFrame(index=df.index)
    feat["ret_1"] = close.pct_change(1)
    feat["ret_3"] = close.pct_change(3)
    feat["ret_6"] = close.pct_change(6)
    feat["ret_12"] = close.pct_change(12)
    feat["ret_24"] = close.pct_change(24)

    feat["rsi14"] = RSIIndicator(close, window=14).rsi() / 100.0

    macd = MACD(close)
    feat["macd_hist_norm"] = macd.macd_diff() / close

    atr14 = AverageTrueRange(high, low, close, window=14).average_true_range()
    feat["atr14_norm"] = atr14 / close
    feat["atr_regime"] = atr14 / atr14.rolling(50).mean()

    bb = BollingerBands(close, window=20, window_dev=2)
    bb_high, bb_low = bb.bollinger_hband(), bb.bollinger_lband()
    bb_range = (bb_high - bb_low).replace(0, np.nan)
    feat["bb_pct"] = (close - bb_low) / bb_range
    feat["bb_width_norm"] = bb_range / close

    sma20 = SMAIndicator(close, window=20).sma_indicator()
    sma50 = SMAIndicator(close, window=50).sma_indicator()
    ema20 = EMAIndicator(close, window=20).ema_indicator()
    feat["sma20_slope"] = sma20.pct_change(5)
    feat["sma50_slope"] = sma50.pct_change(5)
    feat["ema20_dist_norm"] = (close - ema20) / close

    vol_mean = vol.rolling(50).mean()
    vol_std = vol.rolling(50).std().replace(0, np.nan)
    feat["vol_zscore"] = (vol - vol_mean) / vol_std

    ts = pd.to_datetime(df["ts"], utc=True)
    hour = ts.dt.hour + ts.dt.minute / 60.0
    dow = ts.dt.dayofweek
    feat["hour_sin"] = np.sin(2 * np.pi * hour / 24)
    feat["hour_cos"] = np.cos(2 * np.pi * hour / 24)
    feat["dow_sin"] = np.sin(2 * np.pi * dow / 7)
    feat["dow_cos"] = np.cos(2 * np.pi * dow / 7)

    return feat[FEATURE_COLUMNS]


def make_labels(df: pd.DataFrame, horizon: int = 1, atr_mult: float = 0.25) -> pd.Series:
    """3-class label: -1 (down), 0 (flat), 1 (up), based on the forward return
    over `horizon` candles vs an ATR-scaled noise threshold. Using a threshold
    (rather than a naive sign-of-return split) keeps sub-noise wiggles out of
    the up/down classes, since a random-walk-level move isn't a real signal.

    NOTE: the last `horizon` rows have no future data and are labeled NaN;
    the caller must drop them before training (see `build_dataset`).
    """
    close = df["c"]
    high, low = df["h"], df["l"]
    atr14 = AverageTrueRange(high, low, close, window=14).average_true_range()

    fwd_return = close.shift(-horizon) / close - 1.0
    threshold = atr_mult * (atr14 / close)

    label = pd.Series(0.0, index=df.index, dtype="float64")
    label[fwd_return > threshold] = 1.0
    label[fwd_return < -threshold] = -1.0
    label[fwd_return.isna()] = np.nan  # last `horizon` rows: no future data
    return label


def build_dataset(df: pd.DataFrame, horizon: int = 1, atr_mult: float = 0.25):
    """Returns (X, y) aligned and with warmup/tail NaNs dropped."""
    X = build_feature_frame(df)
    y = make_labels(df, horizon=horizon, atr_mult=atr_mult)
    valid = X.notna().all(axis=1) & y.notna()
    return X[valid].reset_index(drop=True), y[valid].reset_index(drop=True)