"""1-minute scalping backtest engine with realistic bid/ask fills.

Separate from backtest/engine.py (which is mid-price + ATR). Here you BUY the ask
and SELL the bid, so the spread is paid on every round trip and baked into P&L —
no separate cost subtraction. Fixed pip SL/TP, session + spread + time gates,
0.01-lot sizing. See SCALP_PHASE_B_ENGINE.md.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, Optional

import pandas as pd

from risk.currency import quote_to_account


@dataclass
class Ctx:
    """Passed to the strategy each in-session bar (Phase C reads this)."""
    k: int
    m1: pd.DataFrame          # causal slice, bars 0..k inclusive
    price: float              # mid close at k
    ts: str
    htf: dict = field(default_factory=dict)   # hourly-refreshed HTF context


StrategyFn = Callable[[Ctx], Optional[dict]]


@dataclass
class ScalpTrade:
    entry_ts: str
    exit_ts: str
    direction: str
    entry: float
    exit: float
    exit_reason: str          # "tp" | "sl" | "time" | "session_end"
    net_pips: float
    pnl_usd: float
    R: float
    hold_min: int
    session: str
    spread_at_entry: float
    reason: str = ""


@dataclass
class ScalpResult:
    trades: list = field(default_factory=list)
    initial_balance: float = 10_000.0
    final_balance: float = 10_000.0
    equity_curve: list = field(default_factory=list)


def _hm(s: str) -> int:
    h, m = s.split(":")
    return int(h) * 60 + int(m)


def _in_session(ts: pd.Timestamp, sessions) -> Optional[str]:
    mins = ts.hour * 60 + ts.minute
    for start, end in sessions:
        if _hm(start) <= mins < _hm(end):
            return f"{start}-{end}"
    return None


def run_scalp_backtest(
    m1: pd.DataFrame,
    strategy_fn: StrategyFn,
    pair: str,
    tp_pips: float = 5.0,
    sl_pips: float = 4.0,
    lot: float = 0.01,
    sessions=(("07:00", "16:00"), ("12:00", "21:00")),
    max_hold_min: int = 45,
    max_spread_pips: float = 1.5,
    account_ccy: str = "USD",
    initial_balance: float = 10_000.0,
    htf_provider: Optional[Callable] = None,
    slippage_pips: float = 0.0,
    pip: Optional[float] = None,
) -> ScalpResult:
    if pip is None:                   # default: FX pip (index CFDs pass pip=1.0 for points)
        pip = 0.01 if pair.endswith("JPY") else 0.0001
    slip = slippage_pips * pip        # adverse fill slippage, on top of the spread
    units = lot * 100_000
    ts = pd.to_datetime(m1["ts"], utc=True).reset_index(drop=True)
    bid_h = m1["bid_h"].to_numpy(float); bid_l = m1["bid_l"].to_numpy(float)
    bid_c = m1["bid_c"].to_numpy(float); bid_o = m1["bid_o"].to_numpy(float)
    ask_h = m1["ask_h"].to_numpy(float); ask_l = m1["ask_l"].to_numpy(float)
    ask_c = m1["ask_c"].to_numpy(float); ask_o = m1["ask_o"].to_numpy(float)
    c = m1["c"].to_numpy(float)
    n = len(m1)

    res = ScalpResult(initial_balance=initial_balance, final_balance=initial_balance)
    balance = initial_balance
    pos = None
    last_hour = None
    htf: dict = {}

    def close_trade(exit_price, reason, k):
        nonlocal pos, balance
        exit_price += -slip if pos["direction"] == "long" else slip   # adverse exit fill
        move = (exit_price - pos["entry"]) if pos["direction"] == "long" else (pos["entry"] - exit_price)
        net_pips = move / pip
        pnl_usd = quote_to_account(move * units, pair, exit_price, account_ccy)
        risk_usd = pos["sl_pips"] * units * pip
        R = pnl_usd / risk_usd if risk_usd else 0.0
        hold = int((ts.iloc[k] - ts.iloc[pos["entry_index"]]).total_seconds() // 60)
        balance += pnl_usd
        res.trades.append(ScalpTrade(
            entry_ts=str(ts.iloc[pos["entry_index"]]), exit_ts=str(ts.iloc[k]),
            direction=pos["direction"], entry=pos["entry"], exit=exit_price,
            exit_reason=reason, net_pips=net_pips, pnl_usd=pnl_usd, R=R,
            hold_min=hold, session=pos["session"], spread_at_entry=pos["spread_at_entry"],
            reason=pos["reason"]))
        res.equity_curve.append({"ts": str(ts.iloc[k]), "balance": balance})
        pos = None

    for k in range(n - 1):
        tk = ts.iloc[k]
        sess = _in_session(tk, sessions)

        # ---- manage open position ----
        if pos is not None and k > pos["entry_index"]:
            if pos["direction"] == "long":
                hit_sl = bid_l[k] <= pos["sl"]; hit_tp = bid_h[k] >= pos["tp"]
            else:
                hit_sl = ask_h[k] >= pos["sl"]; hit_tp = ask_l[k] <= pos["tp"]
            if hit_sl:            # pessimistic: SL before TP on same bar
                close_trade(pos["sl"], "sl", k); continue
            if hit_tp:
                close_trade(pos["tp"], "tp", k); continue
            hold = (tk - ts.iloc[pos["entry_index"]]).total_seconds() / 60
            if hold >= max_hold_min:
                close_trade(bid_c[k] if pos["direction"] == "long" else ask_c[k], "time", k); continue
            if sess is None:      # left the session -> flat
                close_trade(bid_c[k] if pos["direction"] == "long" else ask_c[k], "session_end", k); continue
        if pos is not None:
            continue

        # ---- consider a new entry (flat, in session) ----
        if sess is None:
            continue
        if htf_provider is not None and tk.hour != last_hour:
            htf = htf_provider(m1.iloc[:k + 1], tk) or {}
            last_hour = tk.hour
        sig = strategy_fn(Ctx(k=k, m1=m1.iloc[:k + 1], price=float(c[k]), ts=str(tk), htf=htf))
        if not sig:
            continue
        spread_k = (ask_c[k] - bid_c[k]) / pip
        if spread_k > max_spread_pips:
            continue
        e = k + 1
        direction = sig["direction"]
        tpp = float(sig.get("tp_pips", tp_pips)); slp = float(sig.get("sl_pips", sl_pips))
        if direction == "long":
            entry = ask_o[e] + slip; tp = entry + tpp * pip; sl = entry - slp * pip
        else:
            entry = bid_o[e] - slip; tp = entry - tpp * pip; sl = entry + slp * pip
        pos = {"direction": direction, "entry": entry, "tp": tp, "sl": sl,
               "sl_pips": slp, "entry_index": e, "session": sess,
               "spread_at_entry": round(spread_k, 2), "reason": sig.get("reason", "")}

    res.final_balance = balance
    return res


def summarize(res: ScalpResult) -> dict:
    import numpy as np
    tr = res.trades
    n = len(tr)
    if n == 0:
        return {"n": 0}
    pips = np.array([t.net_pips for t in tr])
    usd = np.array([t.pnl_usd for t in tr])
    days = max(1, (pd.to_datetime(tr[-1].exit_ts) - pd.to_datetime(tr[0].entry_ts)).days)
    return {
        "n": n, "trades_per_day": round(n / days, 2),
        "win_rate": round(float((pips > 0).mean()), 4),
        "avg_net_pips": round(float(pips.mean()), 3),
        "expectancy_usd": round(float(usd.mean()), 4),
        "total_usd": round(float(usd.sum()), 2),
        "final_balance": round(res.final_balance, 2),
        "avg_hold_min": round(float(np.mean([t.hold_min for t in tr])), 1),
        "exit_mix": {r: sum(1 for t in tr if t.exit_reason == r) for r in ("tp", "sl", "time", "session_end")},
    }
