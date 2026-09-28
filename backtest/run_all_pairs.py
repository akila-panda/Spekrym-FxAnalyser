"""Robustness check: backtest the multi-agent coordinator AND the raw forecast
on every trained pair's out-of-sample holdout, with realistic costs, so we can
see whether the Phase 4 edge generalizes or is EUR_USD-specific.

Run: python -m backtest.run_all_pairs
"""
import asyncio
import json
import logging
from pathlib import Path

from backtest.engine import run_backtest
from backtest.report import build_report
from backtest.strategies.coordinator_signal import make_strategy as make_coordinator
from backtest.strategies.forecast_signal import make_strategy as make_forecast
from forecast.train import HOLDOUT_FRACTION
from ta_engine.loader import load_candles

logger = logging.getLogger("run_all_pairs")

PAIRS = ["EUR_USD", "GBP_USD", "USD_JPY", "AUD_USD", "USD_CAD"]
TIMEFRAME = "H1"
CANDLE_LIMIT = 15000
WARMUP = 260
SPREAD_PIPS = 0.6
SLIPPAGE_PIPS = 0.1


async def _backtest(pair, strategy_fn, df_eval, first_tradeable_index):
    result = run_backtest(df_eval, strategy_fn, initial_balance=10_000.0,
                          risk_pct=1.0, window=first_tradeable_index, pair=pair,
                          spread_pips=SPREAD_PIPS, slippage_pips=SLIPPAGE_PIPS)
    return build_report(result, pair, TIMEFRAME)


async def run_pair(pair: str) -> dict:
    df = await load_candles(pair, TIMEFRAME, limit=CANDLE_LIMIT)
    holdout_start = int(len(df) * (1 - HOLDOUT_FRACTION))
    window_start = max(0, holdout_start - WARMUP)
    df_eval = df.iloc[window_start:].reset_index(drop=True)
    first_tradeable_index = holdout_start - window_start

    coord = await _backtest(pair, make_coordinator(pair), df_eval, first_tradeable_index)
    fc = await _backtest(pair, make_forecast(pair), df_eval, first_tradeable_index)
    logger.info("%s | coordinator ret=%+.2f%% dd=%.2f%% n=%d | forecast ret=%+.2f%% dd=%.2f%% n=%d",
                pair, coord["total_return_pct"], coord["max_drawdown_pct"], coord["total_trades"],
                fc["total_return_pct"], fc["max_drawdown_pct"], fc["total_trades"])
    return {"pair": pair, "coordinator": coord, "forecast": fc}


async def main():
    rows = []
    for pair in PAIRS:
        try:
            rows.append(await run_pair(pair))
        except Exception:
            logger.exception("backtest failed for %s", pair)

    # write summary
    out_dir = Path("backtest/results")
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "all_pairs_summary.json").write_text(json.dumps(rows, indent=2, default=str))

    lines = ["# All-pairs robustness — coordinator vs raw forecast (costs on)", "",
             "| Pair | Strategy | Trades | Win% | Return% | MaxDD% |",
             "|---|---|---|---|---|---|"]
    for r in rows:
        for strat in ("coordinator", "forecast"):
            d = r[strat]
            lines.append(f"| {r['pair']} | {strat} | {d['total_trades']} | "
                         f"{d['win_rate']*100:.1f} | {d['total_return_pct']:.2f} | "
                         f"{d['max_drawdown_pct']:.2f} |")
    (out_dir / "all_pairs_summary.md").write_text("\n".join(lines))

    print("\n".join(lines))


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(main())
