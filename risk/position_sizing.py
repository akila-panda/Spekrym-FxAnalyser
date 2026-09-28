from dataclasses import dataclass

from risk.currency import quote_to_account


@dataclass
class PositionSize:
    units: float
    risk_amount: float
    stop_distance: float


def calculate_position_size(balance: float, risk_pct: float, entry: float, stop: float,
                            pair: str | None = None, account_ccy: str = "USD") -> PositionSize:
    """Units sized so that a stop-out loses exactly `risk_pct`% of `balance`.

    `stop_distance` is measured in the pair's quote currency (quote units per
    base unit). When `pair` is given it is converted to the account currency so
    the risk is exactly `risk_pct`% of balance for any pair -- including
    USD-base pairs like USD/JPY, where a raw price distance is in JPY, not USD.

    When `pair` is None the old behavior is kept (assumes account currency ==
    quote currency), so existing XXX/USD callers are unchanged.
    """
    if risk_pct <= 0 or risk_pct > 100:
        raise ValueError("risk_pct must be in (0, 100]")
    stop_distance = abs(entry - stop)
    if stop_distance <= 0:
        raise ValueError("stop distance must be > 0")

    risk_amount = balance * (risk_pct / 100)
    # per-unit loss at the stop, in the account currency (convert at entry price)
    if pair is None:
        per_unit_account = stop_distance
    else:
        per_unit_account = quote_to_account(stop_distance, pair, entry, account_ccy)
    units = risk_amount / per_unit_account
    return PositionSize(units=units, risk_amount=risk_amount, stop_distance=stop_distance)