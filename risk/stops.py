def atr_stop_loss(entry: float, atr: float, direction: str, atr_mult: float = 1.5) -> float:
    """ATR-based stop-loss distance from entry."""
    if direction not in ("long", "short"):
        raise ValueError("direction must be 'long' or 'short'")
    offset = atr * atr_mult
    return entry - offset if direction == "long" else entry + offset


def take_profit(entry: float, stop: float, direction: str, rr: float = 2.0) -> float:
    """Take-profit at a fixed reward:risk multiple of the stop distance."""
    if direction not in ("long", "short"):
        raise ValueError("direction must be 'long' or 'short'")
    stop_distance = abs(entry - stop)
    offset = stop_distance * rr
    return entry + offset if direction == "long" else entry - offset


def sl_tp_from_atr(entry: float, atr: float, direction: str, atr_mult: float = 1.5, rr: float = 2.0) -> dict:
    sl = atr_stop_loss(entry, atr, direction, atr_mult)
    tp = take_profit(entry, sl, direction, rr)
    return {"stop_loss": sl, "take_profit": tp}