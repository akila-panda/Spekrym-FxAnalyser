import pandas as pd

BODY_MIN = 1e-9


def _body(row) -> float:
    return abs(row["c"] - row["o"])


def _range(row) -> float:
    return row["h"] - row["l"]


def _upper_wick(row) -> float:
    return row["h"] - max(row["o"], row["c"])


def _lower_wick(row) -> float:
    return min(row["o"], row["c"]) - row["l"]


def _is_bullish(row) -> bool:
    return row["c"] > row["o"]


def _is_bearish(row) -> bool:
    return row["c"] < row["o"]


def detect_engulfing(prev, curr) -> str | None:
    if _is_bearish(prev) and _is_bullish(curr) and curr["o"] <= prev["c"] and curr["c"] >= prev["o"]:
        return "bullish_engulfing"
    if _is_bullish(prev) and _is_bearish(curr) and curr["o"] >= prev["c"] and curr["c"] <= prev["o"]:
        return "bearish_engulfing"
    return None


def detect_pin_bar(row) -> str | None:
    rng = _range(row)
    if rng <= 0:
        return None
    body = max(_body(row), BODY_MIN)
    lower = _lower_wick(row)
    upper = _upper_wick(row)

    if lower >= 2 * body and upper <= body and lower / rng >= 0.5:
        return "bullish_pin_bar"
    if upper >= 2 * body and lower <= body and upper / rng >= 0.5:
        return "bearish_pin_bar"
    return None


def detect_inside_bar(prev, curr) -> str | None:
    if curr["h"] < prev["h"] and curr["l"] > prev["l"]:
        return "inside_bar"
    return None


def detect_patterns(df: pd.DataFrame, lookback: int = 20) -> list[dict]:
    """Scan the last `lookback` candles for known price-action patterns."""
    patterns = []
    if len(df) < 2:
        return patterns

    window = df.tail(lookback).reset_index(drop=True)

    for i in range(len(window)):
        curr = window.iloc[i]
        ts = curr["ts"] if "ts" in curr else None

        pin = detect_pin_bar(curr)
        if pin:
            patterns.append({"pattern": pin, "ts": str(ts), "index": i})

        if i > 0:
            prev = window.iloc[i - 1]
            eng = detect_engulfing(prev, curr)
            if eng:
                patterns.append({"pattern": eng, "ts": str(ts), "index": i})
            inside = detect_inside_bar(prev, curr)
            if inside:
                patterns.append({"pattern": inside, "ts": str(ts), "index": i})

    return patterns