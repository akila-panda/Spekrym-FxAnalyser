import pandas as pd
from ta.trend import SMAIndicator, EMAIndicator, MACD
from ta.momentum import RSIIndicator
from ta.volatility import AverageTrueRange, BollingerBands


def compute_indicators(df: pd.DataFrame) -> dict:
    """df must have columns: o, h, l, c, v. Returns latest-value snapshot."""
    if len(df) < 50:
        return {"error": "insufficient_data", "candles_available": len(df)}

    close, high, low = df["c"], df["h"], df["l"]

    sma20 = SMAIndicator(close, window=20).sma_indicator()
    sma50 = SMAIndicator(close, window=50).sma_indicator()
    sma200 = SMAIndicator(close, window=200).sma_indicator() if len(df) >= 200 else pd.Series([None])
    ema20 = EMAIndicator(close, window=20).ema_indicator()

    rsi14 = RSIIndicator(close, window=14).rsi()

    macd = MACD(close)
    macd_line = macd.macd()
    macd_signal = macd.macd_signal()
    macd_hist = macd.macd_diff()

    atr14 = AverageTrueRange(high, low, close, window=14).average_true_range()

    bb = BollingerBands(close, window=20, window_dev=2)
    bb_high = bb.bollinger_hband()
    bb_low = bb.bollinger_lband()
    bb_mid = bb.bollinger_mavg()

    def last(series):
        val = series.iloc[-1]
        return None if pd.isna(val) else round(float(val), 6)

    return {
        "ma": {"sma20": last(sma20), "sma50": last(sma50), "sma200": last(sma200), "ema20": last(ema20)},
        "rsi14": last(rsi14),
        "macd": {"macd": last(macd_line), "signal": last(macd_signal), "hist": last(macd_hist)},
        "atr14": last(atr14),
        "bollinger": {"upper": last(bb_high), "mid": last(bb_mid), "lower": last(bb_low)},
    }