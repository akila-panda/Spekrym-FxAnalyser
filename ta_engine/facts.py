from datetime import datetime, timezone

import pandas as pd

from ta_engine.loader import load_candles
from ta_engine.indicators import compute_indicators
from ta_engine.price_action import detect_patterns
from ta_engine.support_resistance import compute_sr_zones
from ta_engine.smc import detect_bos, detect_order_blocks

VALID_TIMEFRAMES = {"H1", "H4", "D1"}


def build_facts(pair: str, timeframe: str, df: pd.DataFrame) -> dict:
    if df.empty:
        return {
            "pair": pair,
            "timeframe": timeframe,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "error": "no_data",
        }

    return {
        "pair": pair,
        "timeframe": timeframe,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "candle_count": len(df),
        "last_close": float(df["c"].iloc[-1]),
        "last_ts": str(df["ts"].iloc[-1]),
        "indicators": compute_indicators(df),
        "price_action": detect_patterns(df),
        "support_resistance": compute_sr_zones(df),
        "smc": {
            "break_of_structure": detect_bos(df),
            "order_blocks": detect_order_blocks(df),
        },
    }


async def get_technical_facts(pair: str, timeframe: str = "H1", limit: int = 500) -> dict:
    if timeframe not in VALID_TIMEFRAMES:
        raise ValueError(f"unsupported timeframe: {timeframe}")
    df = await load_candles(pair, timeframe, limit)
    return build_facts(pair, timeframe, df)