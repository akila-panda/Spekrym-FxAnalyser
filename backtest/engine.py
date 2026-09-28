from dataclasses import dataclass, field
from typing import Callable, Optional

import pandas as pd
from ta.volatility import AverageTrueRange

from risk.currency import quote_to_account, split_pair
from risk.position_sizing import calculate_position_size
from risk.stops import take_profit


def _pip_size(pair: str | None) -> float:
    """FX pip size: 0.01 for JPY-quoted pairs, 0.0001 otherwise."""
    if pair:
        _, quote = split_pair(pair)
        if quote == "JPY":
            return 0.01
    return 0.0001


StrategyFn = Callable[[pd.DataFrame], Optional[dict]]


@dataclass
class Trade:
    direction: str
    entry: float
    sl: float
    tp: float
    units: float
    risk_amount: float
    entry_index: int
    entry_ts: str
    exit_index: int | None = None
    exit_ts: str | None = None
    exit_price: float | None = None
    exit_reason: str | None = None
    pnl: float | None = None
    r_multiple: float | None = None


@dataclass
class BacktestResult:
    trades: list[Trade] = field(default_factory=list)
    equity_curve: list[dict] = field(default_factory=list)
    final_balance: float = 0.0
    initial_balance: float = 0.0


def _current_atr(window_df: pd.DataFrame, period: int = 14) -> float:
    if len(window_df) < period + 1:
        return float((window_df["h"] - window_df["l"]).mean())
    atr = AverageTrueRange(window_df["h"], window_df["l"], window_df["c"], window=period).average_true_range()
    val = atr.iloc[-1]
    return float(val) if pd.notna(val) else float((window_df["h"] - window_df["l"]).mean())


def run_backtest(
    df: pd.DataFrame,
    strategy_fn: StrategyFn,
    initial_balance: float = 10_000.0,
    risk_pct: float = 1.0,
    window: int = 200,
    atr_mult: float = 1.5,
    rr: float = 2.0,
    pair: str | None = None,
    account_ccy: str = "USD",
    spread_pips: float = 0.0,
    slippage_pips: float = 0.0,
    commission_per_trade: float = 0.0,
) -> BacktestResult:
    """Bar-by-bar replay: signal generated from data up to candle k-1 (causal),
    filled at candle k's open, exits checked from candle k+1 high/low onward.
    Only one open position at a time.

    When `pair` is given, position sizing and realized P/L are converted into
    `account_ccy` using each pair's own price, so USD-base pairs (USD_JPY,
    USD_CAD) are sized and scored correctly rather than being ~100x off. When
    `pair` is None the legacy behavior holds (assumes account == quote ccy),
    which is exact for XXX/USD pairs like EUR_USD.
    """
    balance = initial_balance
    result = BacktestResult(initial_balance=initial_balance)
    position: Trade | None = None

    # transaction cost per fill, in price units: you cross half the spread plus
    # slippage on both entry and exit. commission is charged once per round trip.
    pip = _pip_size(pair)
    half_cost = (spread_pips / 2.0 + slippage_pips) * pip

    for k in range(window + 1, len(df)):
        row = df.iloc[k]

        if position is not None:
            hit_sl = row["l"] <= position.sl if position.direction == "long" else row["h"] >= position.sl
            hit_tp = row["h"] >= position.tp if position.direction == "long" else row["l"] <= position.tp

            exit_price = None
            exit_reason = None
            if hit_sl:
                exit_price, exit_reason = position.sl, "stop_loss"
            elif hit_tp:
                exit_price, exit_reason = position.tp, "take_profit"

            if exit_price is not None:
                # exit also crosses the spread: sell the bid (long) / buy the ask (short)
                fill = exit_price - half_cost if position.direction == "long" else exit_price + half_cost
                move = (fill - position.entry) if position.direction == "long" else (position.entry - fill)
                pnl_quote = move * position.units
                # convert quote-ccy P/L to account ccy at the exit price
                pnl = quote_to_account(pnl_quote, pair, fill, account_ccy) if pair else pnl_quote
                pnl -= commission_per_trade
                balance += pnl

                position.exit_index = k
                position.exit_ts = str(row["ts"])
                position.exit_price = exit_price
                position.exit_reason = exit_reason
                position.pnl = pnl
                position.r_multiple = pnl / position.risk_amount if position.risk_amount else None

                result.trades.append(position)
                result.equity_curve.append({"ts": str(row["ts"]), "balance": balance})
                position = None
            continue

        window_df = df.iloc[max(0, k - 1 - window): k].reset_index(drop=True)
        signal = strategy_fn(window_df)
        if not signal:
            continue

        direction = signal["direction"]
        # a strategy may request a per-signal risk % (e.g. confidence-scaled
        # sizing from the coordinator); otherwise use the run-level default.
        signal_risk_pct = float(signal.get("risk_pct", risk_pct))
        # fill crosses the spread: buy the ask (higher) / sell the bid (lower)
        entry = float(row["o"]) + (half_cost if direction == "long" else -half_cost)
        atr = _current_atr(window_df)

        if "reference_low" in signal and direction == "long":
            sl = signal["reference_low"] - 0.1 * atr
        elif "reference_high" in signal and direction == "short":
            sl = signal["reference_high"] + 0.1 * atr
        else:
            sl = entry - atr * atr_mult if direction == "long" else entry + atr * atr_mult

        if (direction == "long" and sl >= entry) or (direction == "short" and sl <= entry):
            continue

        tp = take_profit(entry, sl, direction, rr)

        try:
            ps = calculate_position_size(balance, signal_risk_pct, entry, sl, pair=pair, account_ccy=account_ccy)
        except ValueError:
            continue

        position = Trade(
            direction=direction, entry=entry, sl=sl, tp=tp,
            units=ps.units, risk_amount=ps.risk_amount,
            entry_index=k, entry_ts=str(row["ts"]),
        )

    result.final_balance = balance
    return result