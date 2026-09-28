import json
from pathlib import Path

from backtest.engine import BacktestResult


def _max_drawdown(equity_curve: list[dict]) -> float:
    if not equity_curve:
        return 0.0
    peak = equity_curve[0]["balance"]
    max_dd = 0.0
    for point in equity_curve:
        bal = point["balance"]
        peak = max(peak, bal)
        dd = (peak - bal) / peak if peak else 0.0
        max_dd = max(max_dd, dd)
    return max_dd


def build_report(result: BacktestResult, pair: str, timeframe: str) -> dict:
    trades = result.trades
    n = len(trades)
    wins = [t for t in trades if (t.pnl or 0) > 0]
    losses = [t for t in trades if (t.pnl or 0) <= 0]

    win_rate = len(wins) / n if n else 0.0
    avg_win_r = sum(t.r_multiple for t in wins) / len(wins) if wins else 0.0
    avg_loss_r = sum(t.r_multiple for t in losses) / len(losses) if losses else 0.0
    total_return_pct = (result.final_balance - result.initial_balance) / result.initial_balance * 100 if result.initial_balance else 0.0

    return {
        "pair": pair,
        "timeframe": timeframe,
        "total_trades": n,
        "win_rate": round(win_rate, 4),
        "avg_win_r_multiple": round(avg_win_r, 3),
        "avg_loss_r_multiple": round(avg_loss_r, 3),
        "reward_risk_ratio": round(abs(avg_win_r / avg_loss_r), 3) if avg_loss_r else None,
        "max_drawdown_pct": round(_max_drawdown(result.equity_curve) * 100, 3),
        "initial_balance": result.initial_balance,
        "final_balance": round(result.final_balance, 2),
        "total_return_pct": round(total_return_pct, 3),
        "equity_curve": result.equity_curve,
        "trades": [
            {
                "direction": t.direction, "entry": t.entry, "sl": t.sl, "tp": t.tp,
                "entry_ts": t.entry_ts, "exit_ts": t.exit_ts, "exit_price": t.exit_price,
                "exit_reason": t.exit_reason, "pnl": round(t.pnl, 2) if t.pnl is not None else None,
                "r_multiple": round(t.r_multiple, 3) if t.r_multiple is not None else None,
            }
            for t in trades
        ],
    }


def write_json_report(report: dict, path: str):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps(report, indent=2))


def write_markdown_report(report: dict, path: str):
    lines = [
        f"# Backtest Report — {report['pair']} ({report['timeframe']})",
        "",
        f"- Total trades: **{report['total_trades']}**",
        f"- Win rate: **{report['win_rate'] * 100:.1f}%**",
        f"- Avg win: {report['avg_win_r_multiple']}R  |  Avg loss: {report['avg_loss_r_multiple']}R",
        f"- Reward:Risk ratio: {report['reward_risk_ratio']}",
        f"- Max drawdown: **{report['max_drawdown_pct']}%**",
        f"- Initial balance: {report['initial_balance']}",
        f"- Final balance: {report['final_balance']}",
        f"- Total return: **{report['total_return_pct']}%**",
        "",
        "## Trade Log",
        "",
        "| Dir | Entry | SL | TP | Exit | Reason | PnL | R |",
        "|---|---|---|---|---|---|---|---|",
    ]
    for t in report["trades"]:
        exit_price_str = f"{t['exit_price']:.5f}" if t["exit_price"] is not None else "-"
        lines.append(
            f"| {t['direction']} | {t['entry']:.5f} | {t['sl']:.5f} | {t['tp']:.5f} | "
            f"{exit_price_str} | {t['exit_reason']} | {t['pnl']} | {t['r_multiple']} |"
        )
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text("\n".join(lines))