"""P&L walk-forward validation of the EUR/USD forecast edge.

The decisive test from STRATEGY_REDESIGN.md: does raising the confidence
threshold produce an out-of-sample edge whose expectancy CI clears zero?

For each expanding fold: train a model in-memory on the past only, then TRADE
the unseen fold (costs on) at several confidence thresholds. Pool the OOS trades
across folds per threshold and bootstrap the expectancy. Retrains per fold,
never writes to the model registry, read-only on the DB.

Run: python -m research.walkforward_eurusd
"""
import asyncio
import numpy as np

from ta_engine.loader import load_candles
from forecast.features import build_feature_frame, build_dataset, FEATURE_COLUMNS
from forecast.model import ForecastModel
from backtest.engine import run_backtest

PAIR, TF, LIMIT, HORIZON = "EUR_USD", "H1", 15000, 1
N_FOLDS = 5
MIN_TRAIN_FRAC = 0.5
WARMUP = 60
THRESHOLDS = [0.45, 0.50, 0.55]
SPREAD, SLIP = 0.6, 0.1


def _strategy(pred_by_ts, thr, short_only=False):
    def s(window_df):
        ts = str(window_df["ts"].iloc[-1])
        p = pred_by_ts.get(ts)
        if not p or p["predicted_class"] == "flat" or p["confidence"] < thr:
            return None
        direction = "long" if p["predicted_class"] == "up" else "short"
        if short_only and direction != "short":
            return None
        return {"direction": direction, "reason": "wf"}
    return s


def _bootstrap(rs, iters=20000, seed=42):
    if len(rs) == 0:
        return (0.0, 0.0, 0.0, 1.0)
    rng = np.random.default_rng(seed)
    means = np.array([rng.choice(rs, len(rs), replace=True).mean() for _ in range(iters)])
    return (float(rs.mean()), float(np.percentile(means, 2.5)),
            float(np.percentile(means, 97.5)), float((means <= 0).mean()))


async def main():
    df = await load_candles(PAIR, TF, limit=LIMIT)
    feats_full = build_feature_frame(df)  # causal per-row features
    n = len(df)
    min_train = int(n * MIN_TRAIN_FRAC)
    fold_size = (n - min_train) // N_FOLDS

    print(f"EUR/USD walk-forward | candles={n} | folds={N_FOLDS} | "
          f"fold_size={fold_size} | costs spread={SPREAD} slip={SLIP}")

    pooled = {thr: [] for thr in THRESHOLDS}
    pooled_short = {thr: [] for thr in THRESHOLDS}
    per_fold = {thr: [] for thr in THRESHOLDS}

    for i in range(N_FOLDS):
        train_end = min_train + i * fold_size
        test_end = min(train_end + fold_size, n)
        if test_end <= train_end:
            break

        X, y = build_dataset(df.iloc[:train_end], horizon=HORIZON)
        model = ForecastModel(PAIR, TF, HORIZON).fit(X, y)

        pred_by_ts = {}
        for idx in range(train_end, test_end):
            row = feats_full.iloc[[idx]]
            if row.isna().any(axis=1).iloc[0]:
                continue
            pred_by_ts[str(df["ts"].iloc[idx])] = model.predict_distribution(row)

        fold_df = df.iloc[train_end - WARMUP: test_end].reset_index(drop=True)

        for thr in THRESHOLDS:
            res = run_backtest(fold_df, _strategy(pred_by_ts, thr), window=WARMUP,
                               pair=PAIR, spread_pips=SPREAD, slippage_pips=SLIP)
            rs = [t.r_multiple for t in res.trades if t.r_multiple is not None]
            pooled[thr].extend(rs)
            per_fold[thr].append((len(rs), sum(rs)))

            res_s = run_backtest(fold_df, _strategy(pred_by_ts, thr, short_only=True),
                                 window=WARMUP, pair=PAIR, spread_pips=SPREAD, slippage_pips=SLIP)
            pooled_short[thr].extend([t.r_multiple for t in res_s.trades if t.r_multiple is not None])

        print(f"  fold {i}: train={train_end} test={train_end}->{test_end} "
              f"| thr0.45 n={per_fold[0.45][-1][0]} R={per_fold[0.45][-1][1]:+.2f}")

    def report(label, pool):
        print(f"\n=== {label} (pooled OOS across folds) ===")
        for thr in THRESHOLDS:
            rs = np.array(pool[thr], dtype=float)
            if len(rs) == 0:
                print(f"  thr {thr}: no trades"); continue
            mean, lo, hi, p0 = _bootstrap(rs)
            win = (rs > 0).mean()
            print(f"  thr {thr}: n={len(rs):3d}  win={win:.3f}  expR={mean:+.4f}  "
                  f"totalR={rs.sum():+.2f}  CI95=[{lo:+.3f},{hi:+.3f}]  P(exp<=0)={p0:.2f}  "
                  f"{'EDGE' if lo > 0 else 'not significant'}")

    report("BOTH DIRECTIONS", pooled)
    report("SHORT ONLY", pooled_short)

    print("\nPer-fold totalR (thr 0.50, both dirs):",
          [f"{r:+.1f}" for _, r in per_fold[0.50]])


if __name__ == "__main__":
    asyncio.run(main())
