"""Adversarial forensics on the EUR/USD forecast edge.

Goal: try to BREAK the apparent edge. Reproduce the baseline, reconcile the
run-to-run discrepancy, then stress it with: bootstrap significance on the
small (~85) trade sample, probability calibration, trade clustering / effective
sample size, session breakdown, MAE/MFE, and cost sensitivity (break-even
spread). Writes TRADE_ANALYSIS.csv and prints a structured report.

Focuses on the FORECAST strategy, which the cross-pair evidence shows is the
real edge candidate (the coordinator does not beat it). Read-only w.r.t. the
DB and strategy code.

Run: python -m research.forensics_eurusd
"""
import asyncio
import json
import numpy as np
import pandas as pd

from ta_engine.loader import load_candles
from forecast.predict import predict_from_window
from forecast.train import HOLDOUT_FRACTION
from backtest.engine import run_backtest

PAIR = "EUR_USD"
TF = "H1"
LIMIT = 15000
WARMUP = 260
CONF_THR = 0.45  # matches backtest.strategies.forecast_signal

# capture forecast context per signal, keyed by the ts of the window's last bar
_CTX = {}


def _instrumented_strategy():
    def strat(window_df):
        if len(window_df) < WARMUP:
            return None
        fc = predict_from_window(window_df, PAIR, TF, 1)
        if fc is None:
            return None
        last_ts = str(window_df["ts"].iloc[-1])
        _CTX[last_ts] = fc
        pred, conf = fc["predicted_class"], fc["confidence"]
        if pred == "flat" or conf < CONF_THR:
            return None
        return {"direction": "long" if pred == "up" else "short",
                "reason": f"forecast_{pred}"}
    return strat


def _session(hour: int) -> str:
    if 7 <= hour < 12:
        return "london"
    if 12 <= hour < 16:
        return "london_ny_overlap"
    if 16 <= hour < 20:
        return "new_york"
    if 20 <= hour < 24:
        return "late_ny"
    return "asia"


def _metrics(rs: np.ndarray) -> dict:
    n = len(rs)
    if n == 0:
        return {"n": 0}
    wins = rs[rs > 0]
    losses = rs[rs <= 0]
    gross_win = wins.sum()
    gross_loss = -losses.sum()
    streak = maxstreak = 0
    for r in rs:
        streak = streak + 1 if r <= 0 else 0
        maxstreak = max(maxstreak, streak)
    return {
        "n": int(n),
        "win_rate": float((rs > 0).mean()),
        "avg_win_R": float(wins.mean()) if len(wins) else 0.0,
        "avg_loss_R": float(losses.mean()) if len(losses) else 0.0,
        "expectancy_R": float(rs.mean()),
        "profit_factor": float(gross_win / gross_loss) if gross_loss > 0 else float("inf"),
        "total_R": float(rs.sum()),
        "max_losing_streak": int(maxstreak),
    }


def _bootstrap_expectancy(rs: np.ndarray, iters: int = 20000, seed: int = 42) -> dict:
    rng = np.random.default_rng(seed)
    n = len(rs)
    means = np.array([rng.choice(rs, size=n, replace=True).mean() for _ in range(iters)])
    return {
        "expectancy_R_mean": float(rs.mean()),
        "ci95_low": float(np.percentile(means, 2.5)),
        "ci95_high": float(np.percentile(means, 97.5)),
        "p_expectancy_le_0": float((means <= 0).mean()),
    }


def _wilson(p: float, n: int, z: float = 1.96) -> tuple[float, float]:
    if n == 0:
        return (0.0, 0.0)
    denom = 1 + z * z / n
    center = (p + z * z / (2 * n)) / denom
    half = z * np.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denom
    return (center - half, center + half)


def build_trades(df_eval, first_idx, spread=0.6, slip=0.1):
    _CTX.clear()
    res = run_backtest(df_eval, _instrumented_strategy(), initial_balance=10_000.0,
                       risk_pct=1.0, window=first_idx, pair=PAIR,
                       spread_pips=spread, slippage_pips=slip)
    ts = df_eval["ts"].astype(str).tolist()
    rows = []
    prev_exit_idx = None
    for t in res.trades:
        k = t.entry_index
        sig_ts = ts[k - 1] if k - 1 < len(ts) else None
        fc = _CTX.get(sig_ts, {})
        dist = fc.get("distribution", {}) if fc else {}
        risk = abs(t.entry - t.sl) or np.nan
        seg = df_eval.iloc[t.entry_index: (t.exit_index or t.entry_index) + 1]
        if t.direction == "long":
            mae = (t.entry - seg["l"].min()) / risk
            mfe = (seg["h"].max() - t.entry) / risk
        else:
            mae = (seg["h"].max() - t.entry) / risk
            mfe = (t.entry - seg["l"].min()) / risk
        entry_dt = pd.to_datetime(t.entry_ts)
        rows.append({
            "entry_ts": t.entry_ts, "exit_ts": t.exit_ts, "direction": t.direction,
            "entry": t.entry, "sl": t.sl, "tp": t.tp, "exit_reason": t.exit_reason,
            "pnl": t.pnl, "R": t.r_multiple,
            "holding_bars": (t.exit_index - t.entry_index) if t.exit_index else None,
            "hour": entry_dt.hour, "dow": entry_dt.dayofweek, "session": _session(entry_dt.hour),
            "p_up": dist.get("up"), "p_down": dist.get("down"), "p_flat": dist.get("flat"),
            "confidence": fc.get("confidence") if fc else None,
            "MAE_R": float(mae), "MFE_R": float(mfe),
            "bars_since_prev": (t.entry_index - prev_exit_idx) if prev_exit_idx else None,
            "entry_index": t.entry_index, "exit_index": t.exit_index,
        })
        prev_exit_idx = t.exit_index
    return pd.DataFrame(rows), res


async def main():
    df = await load_candles(PAIR, TF, limit=LIMIT)
    holdout_start = int(len(df) * (1 - HOLDOUT_FRACTION))
    window_start = max(0, holdout_start - WARMUP)
    df_eval = df.iloc[window_start:].reset_index(drop=True)
    first_idx = holdout_start - window_start

    print("=" * 70)
    print(f"DATASET: {PAIR} {TF} | total candles={len(df)} | "
          f"holdout={len(df_eval)-first_idx} tradeable (+{first_idx} warmup)")
    print(f"holdout period: {df_eval['ts'].iloc[first_idx]}  ->  {df_eval['ts'].iloc[-1]}")

    # --- reconciliation: no-cost vs with-cost ---
    trades_nocost, res_nc = build_trades(df_eval, first_idx, spread=0.0, slip=0.0)
    trades, res = build_trades(df_eval, first_idx, spread=0.6, slip=0.1)
    trades.to_csv("TRADE_ANALYSIS.csv", index=False)

    rs = trades["R"].to_numpy(dtype=float)
    rs_nc = trades_nocost["R"].to_numpy(dtype=float)
    print("\n--- RECONCILIATION (same trades, cost delta) ---")
    print(f"no-cost : n={len(rs_nc)} totalR={rs_nc.sum():.2f} expR={rs_nc.mean():.4f} "
          f"finalBal={res_nc.final_balance:.2f}")
    print(f"cost0.6 : n={len(rs)} totalR={rs.sum():.2f} expR={rs.mean():.4f} "
          f"finalBal={res.final_balance:.2f}")

    print("\n--- BASELINE METRICS (with cost) ---")
    m = _metrics(rs)
    longs = trades[trades.direction == "long"]; shorts = trades[trades.direction == "short"]
    m["long_trades"] = len(longs); m["short_trades"] = len(shorts)
    m["avg_holding_bars"] = float(trades["holding_bars"].dropna().mean())
    m["median_holding_bars"] = float(trades["holding_bars"].dropna().median())
    hold_days = (pd.to_datetime(df_eval["ts"].iloc[-1]) - pd.to_datetime(df_eval["ts"].iloc[first_idx])).days or 1
    m["trades_per_day"] = len(rs) / hold_days
    print(json.dumps(m, indent=2))

    print("\n--- SMALL-SAMPLE SIGNIFICANCE (bootstrap, 20k) ---")
    bs = _bootstrap_expectancy(rs)
    wl, wh = _wilson(float((rs > 0).mean()), len(rs))
    print(json.dumps(bs, indent=2))
    print(f"win_rate={ (rs>0).mean():.3f}  Wilson95=({wl:.3f},{wh:.3f})  breakeven@2:1=0.333")

    print("\n--- CALIBRATION: realized win rate by forecast confidence bucket ---")
    tt = trades.dropna(subset=["confidence"]).copy()
    tt["bucket"] = pd.cut(tt["confidence"], [0, 0.45, 0.5, 0.55, 0.6, 1.0])
    for b, g in tt.groupby("bucket", observed=True):
        if len(g):
            print(f"  {str(b):>14}: n={len(g):3d}  win={ (g.R>0).mean():.3f}  expR={g.R.mean():+.3f}")

    print("\n--- TRADE INDEPENDENCE / CLUSTERING ---")
    gap = trades["bars_since_prev"].dropna()
    clustered = trades[trades["bars_since_prev"].fillna(999) <= 6]
    isolated = trades[trades["bars_since_prev"].fillna(999) > 6]
    print(f"  trades={len(trades)}  median_gap_bars={gap.median():.0f}  "
          f"within_6bars={len(clustered)}  isolated={len(isolated)}")
    if len(clustered):
        print(f"  clustered expR={clustered.R.mean():+.3f} (n={len(clustered)})")
    if len(isolated):
        print(f"  isolated  expR={isolated.R.mean():+.3f} (n={len(isolated)})")
    if len(rs) > 3:
        ac = np.corrcoef(rs[:-1], rs[1:])[0, 1]
        eff = len(rs) * (1 - ac) / (1 + ac) if (1 + ac) != 0 else len(rs)
        print(f"  lag1_autocorr(R)={ac:+.3f}  effective_N~={eff:.0f}")

    print("\n--- SESSION BREAKDOWN ---")
    for s, g in trades.groupby("session"):
        print(f"  {s:>18}: n={len(g):3d}  win={ (g.R>0).mean():.3f}  expR={g.R.mean():+.3f}  totalR={g.R.sum():+.2f}")

    print("\n--- DIRECTION BREAKDOWN ---")
    for d, g in trades.groupby("direction"):
        print(f"  {d:>5}: n={len(g):3d}  win={ (g.R>0).mean():.3f}  expR={g.R.mean():+.3f}")

    print("\n--- MAE/MFE (R units) ---")
    print(f"  MAE  mean={trades.MAE_R.mean():.2f}  p50={trades.MAE_R.median():.2f}  p90={trades.MAE_R.quantile(.9):.2f}")
    print(f"  MFE  mean={trades.MFE_R.mean():.2f}  p50={trades.MFE_R.median():.2f}  p90={trades.MFE_R.quantile(.9):.2f}")
    winners = trades[trades.R > 0]; losers = trades[trades.R <= 0]
    if len(losers):
        print(f"  losers  MFE p50={losers.MFE_R.median():.2f} (did losers run our way first?)")
    if len(winners):
        print(f"  winners MAE p50={winners.MAE_R.median():.2f} (heat before winning)")

    print("\n--- COST SENSITIVITY (break-even spread search) ---")
    for sp in [0.0, 0.3, 0.6, 1.0, 1.5, 2.0]:
        tr, r = build_trades(df_eval, first_idx, spread=sp, slip=0.0)
        rr = tr["R"].to_numpy(dtype=float)
        print(f"  spread={sp:>3} pip: totalR={rr.sum():+.2f}  expR={rr.mean():+.4f}  "
              f"return={ (r.final_balance/10000-1)*100:+.2f}%")

    print("\nWROTE TRADE_ANALYSIS.csv  (", len(trades), "trades )")


if __name__ == "__main__":
    asyncio.run(main())
