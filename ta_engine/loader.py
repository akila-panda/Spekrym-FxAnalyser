import pandas as pd
from sqlalchemy import text

from data.db import get_session

# Timeframes stored natively in the DB (fetched from OANDA directly).
NATIVE_TF = {"M1", "M5", "M15", "M30", "H1"}
# Timeframes derived by resampling native H1 (pandas offset alias, source count factor).
DERIVED_TF = {
    "H4": ("4h", 4),
    "D1": ("1D", 24),
}


async def load_candles(pair: str, timeframe: str = "H1", limit: int = 500) -> pd.DataFrame:
    """Load candles for `pair`/`timeframe`. Native timeframes (M1..H1) are read
    directly; H4/D1 are resampled from stored H1."""
    if timeframe in NATIVE_TF:
        source_tf, rule, fetch_limit = timeframe, None, limit
    elif timeframe in DERIVED_TF:
        rule, factor = DERIVED_TF[timeframe]
        source_tf, fetch_limit = "H1", limit * factor
    else:
        raise ValueError(f"unsupported timeframe: {timeframe}")

    async with get_session() as session:
        result = await session.execute(
            text(
                """
                SELECT ts, o, h, l, c, v,
                       bid_o, bid_h, bid_l, bid_c, ask_o, ask_h, ask_l, ask_c
                FROM candles
                WHERE pair = :pair AND tf = :tf AND complete = TRUE
                ORDER BY ts DESC LIMIT :lim
                """
            ),
            {"pair": pair, "tf": source_tf, "lim": fetch_limit},
        )
        rows = result.fetchall()

    _cols = ["ts", "o", "h", "l", "c", "v",
             "bid_o", "bid_h", "bid_l", "bid_c", "ask_o", "ask_h", "ask_l", "ask_c"]
    if not rows:
        return pd.DataFrame(columns=_cols)

    df = pd.DataFrame(rows, columns=_cols).iloc[::-1].reset_index(drop=True)
    df["ts"] = pd.to_datetime(df["ts"], utc=True)
    df = df.set_index("ts")

    if rule:  # H4 / D1 resampled from native H1
        df = df.resample(rule).agg(
            {"o": "first", "h": "max", "l": "min", "c": "last", "v": "sum"}
        ).dropna()

    return df.tail(limit).reset_index()