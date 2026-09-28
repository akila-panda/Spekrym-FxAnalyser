"""Sample rule-based strategy: buy on bullish order block reclaim, sell on
bearish order block reclaim.

After a break-of-structure (BOS), an order block (the last opposite-colored
candle before the impulse) is considered "unmitigated" until price returns
into its [low, high] zone. A "reclaim" signal fires on the candle where price
dips into an unmitigated order block zone and closes back through it in the
direction of the original break -- i.e. the level held.

Bullish: after a bullish BOS, price dips into the bullish OB zone and closes
back above the OB high (buyers defended the zone) -> long.

Bearish: after a bearish BOS, price rallies into the bearish OB zone and
closes back below the OB low (sellers defended the zone) -> short.
"""
import pandas as pd

from ta_engine.smc import detect_order_blocks

MIN_CANDLES = 30


def generate_signal(window_df: pd.DataFrame, order: int = 2) -> dict | None:
    """window_df: causal slice of candles ending at the current (just-closed) candle.
    Returns a raw signal dict or None. Entry/SL/TP sizing is left to the engine.

    If both a bullish and bearish reclaim fire on the same candle (rare, but
    possible with overlapping zones), the bullish signal takes priority since
    it's checked first -- only one signal is returned per candle, matching the
    engine's one-position-at-a-time model.
    """
    if len(window_df) < MIN_CANDLES:
        return None

    all_blocks = detect_order_blocks(window_df, order=order)
    bullish_blocks = [b for b in all_blocks if b["type"] == "bullish_ob"]
    bearish_blocks = [b for b in all_blocks if b["type"] == "bearish_ob"]

    last_idx = len(window_df) - 1
    curr = window_df.iloc[last_idx]

    for block in bullish_blocks:
        if block["bos_index"] >= last_idx:
            continue
        ob_low, ob_high = block["low"], block["high"]

        dipped_into_zone = curr["l"] <= ob_high and curr["l"] >= ob_low
        reclaimed = curr["c"] > ob_high

        if dipped_into_zone and reclaimed:
            return {
                "direction": "long",
                "reference_low": ob_low,
                "reference_high": ob_high,
                "reason": f"bullish_ob_reclaim@{block['ts']}",
            }

    for block in bearish_blocks:
        if block["bos_index"] >= last_idx:
            continue
        ob_low, ob_high = block["low"], block["high"]

        rallied_into_zone = curr["h"] >= ob_low and curr["h"] <= ob_high
        reclaimed = curr["c"] < ob_low

        if rallied_into_zone and reclaimed:
            return {
                "direction": "short",
                "reference_low": ob_low,
                "reference_high": ob_high,
                "reason": f"bearish_ob_reclaim@{block['ts']}",
            }

    return None