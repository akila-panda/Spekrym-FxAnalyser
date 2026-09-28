import pandas as pd

from ta_engine.support_resistance import find_swing_points


def detect_bos(df: pd.DataFrame, order: int = 2) -> list[dict]:
    """Break of structure: close breaks beyond the most recent prior swing high/low."""
    events = []
    if len(df) < (2 * order + 3):
        return events

    highs, lows = find_swing_points(df, order)
    last_swing_high = None
    last_swing_low = None
    high_idx = {h["index"]: h for h in highs}
    low_idx = {l["index"]: l for l in lows}

    broken_high = False
    broken_low = False

    for i in range(len(df)):
        if i in high_idx:
            last_swing_high = high_idx[i]
            broken_high = False
        if i in low_idx:
            last_swing_low = low_idx[i]
            broken_low = False

        close = df["c"].iloc[i]
        ts = str(df["ts"].iloc[i])

        if last_swing_high and not broken_high and i > last_swing_high["index"] and close > last_swing_high["price"]:
            events.append({"type": "bullish_bos", "ts": ts, "index": i, "broken_level": last_swing_high["price"]})
            broken_high = True

        if last_swing_low and not broken_low and i > last_swing_low["index"] and close < last_swing_low["price"]:
            events.append({"type": "bearish_bos", "ts": ts, "index": i, "broken_level": last_swing_low["price"]})
            broken_low = True

    return events


def detect_order_blocks(df: pd.DataFrame, order: int = 2) -> list[dict]:
    """Basic order block: last opposite-colored candle before the impulse leg
    that produced a break of structure."""
    blocks = []
    bos_events = detect_bos(df, order)

    for event in bos_events:
        bos_idx = event["index"]
        is_bullish = event["type"] == "bullish_bos"

        ob_index = None
        for j in range(bos_idx - 1, -1, -1):
            row = df.iloc[j]
            is_down = row["c"] < row["o"]
            is_up = row["c"] > row["o"]
            if is_bullish and is_down:
                ob_index = j
                break
            if not is_bullish and is_up:
                ob_index = j
                break

        if ob_index is None:
            continue

        ob_row = df.iloc[ob_index]
        blocks.append({
            "type": "bullish_ob" if is_bullish else "bearish_ob",
            "ts": str(ob_row["ts"]),
            "index": ob_index,
            "high": float(ob_row["h"]),
            "low": float(ob_row["l"]),
            "bos_index": bos_idx,
        })

    return blocks