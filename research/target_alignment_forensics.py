"""Target/execution alignment + regime forensics for the EUR/USD forecast.

Answers three questions with evidence, WITHOUT optimizing the strategy:

  Q1  Why does a +4pp classification edge become ~0R trading expectancy?
      -> decompose: OOS 1-bar accuracy, then cross-tab "prediction correct on
         its own 1-bar target" vs "trade actually won"; payoff asymmetry;
         pre-cost vs post-cost expectancy (is it costs, or already broken?).
  Q2  Is the result regime-dependent?
      -> per-fold realized volatility, trend-efficiency ratio, up-fraction vs
         that fold's trade P&L.
  Q3  Is the target aligned with the trade objective?
      -> the label horizon is 1 bar; trades hold many bars for a 2:1 SL/TP race.
         Measure how often a "correct" 1-bar call still loses the trade.

Expanding walk-forward, in-memory models, read-only. Run:
    python -m research.target_alignment_forensics
"""
import asyncio
import numpy as np
import pandas as pd

from ta_engine.loader import load_candles
from forecast.features import build_feature_frame, build_dataset, make_labels
from forecast.model import ForecastModel
from backtest.engine import run_backtest

PAIR, TF, LIMIT, HORIZON = "EUR_USD", "H1", 15000, 1
N_FOLDS, MIN_TRAIN_FRAC, WARMUP = 5, 0.5, 60
THR = 0.45


def _strategy(pred_by_ts, thr):
    def s(window_df):
        p = pred_by_ts.get(str(window_df["ts"].iloc[-1]))
        if not p or p["predicted_class"] == "flat" or p["confidence"] < thr:
            return None
        return {"direction": "long" if p["predicted_class"] == "up" else "short"}
    return s


async def main():
    df = await load_candles(PAIR, TF, limit=LIMIT)
    feats = build_feature_frame(df)
    labels = make_labels(df, horizon=HORIZON)          # the model's ACTUAL target
    ts_all = df["ts"].astype(str).tolist()
    n = len(df)
    min_train = int(n * MIN_TRAIN_FRAC)
    fold_size = (n - min_train) // N_FOLDS

    fold_rows = []
    all_trades = []
    acc_pool, base_pool = [], []
    pre_R, post_R = [], []

    for i in range(N_FOLDS):
        tr_end = min_train + i * fold_size
        te_end = min(tr_end + fold_size, n)
        if te_end <= tr_end:
            break

        X, y = build_dataset(df.iloc[:tr_end], horizon=HORIZON)
        model = ForecastModel(PAIR, TF, HORIZON).fit(X, y)

        pred_by_ts, y_true, y_pred = {}, [], []
        for idx in range(tr_end, te_end):
            frow = feats.iloc[[idx]]
            if frow.isna().any(axis=1).iloc[0] or pd.isna(labels.iloc[idx]):
                continue
            dist = model.predict_distribution(frow)
            pred_by_ts[ts_all[idx]] = dist
            pred_cls = {"up": 1, "down": -1, "flat": 0}[dist["predicted_class"]]
            y_true.append(int(labels.iloc[idx])); y_pred.append(pred_cls)
        y_true, y_pred = np.array(y_true), np.array(y_pred)
        acc = float((y_true == y_pred).mean()) if len(y_true) else float("nan")
        vals, cnts = np.unique(y_true, return_counts=True)
        base = float(cnts.max() / cnts.sum()) if len(y_true) else float("nan")
        acc_pool.append((acc, len(y_true))); base_pool.append((base, len(y_true)))

        fold_df = df.iloc[tr_end - WARMUP: te_end].reset_index(drop=True)
        res_pre = run_backtest(fold_df, _strategy(pred_by_ts, THR), window=WARMUP,
                               pair=PAIR, spread_pips=0.0, slippage_pips=0.0)
        res = run_backtest(fold_df, _strategy(pred_by_ts, THR), window=WARMUP,
                           pair=PAIR, spread_pips=0.6, slippage_pips=0.1)
        pre_R.extend([t.r_multiple for t in res_pre.trades])
        post_R.extend([t.r_multiple for t in res.trades])

        offset = tr_end - WARMUP
        for t in res.trades:
            gk = offset + t.entry_index
            sig_ts = ts_all[gk - 1]
            p = pred_by_ts.get(sig_ts)
            if p is None or pd.isna(labels.iloc[gk - 1]):
                continue
            pred_cls = {"up": 1, "down": -1, "flat": 0}[p["predicted_class"]]
            correct_1bar = (pred_cls == int(labels.iloc[gk - 1]))
            all_trades.append({"correct_1bar": correct_1bar, "R": t.r_multiple,
                               "dir": t.direction})

        c = df["c"].iloc[tr_end:te_end].to_numpy(dtype=float)
        ret = np.diff(np.log(c))
        vol = float(np.std(ret))
        te = float(abs(ret.sum()) / np.abs(ret).sum()) if np.abs(ret).sum() else 0.0
        up_frac = float((ret > 0).mean())
        fold_rows.append({"fold": i, "n_trades": len(res.trades),
                          "expR": float(np.mean([t.r_multiple for t in res.trades])) if res.trades else 0.0,
                          "totalR": float(np.sum([t.r_multiple for t in res.trades])),
                          "acc_1bar": acc, "baseline": base,
                          "vol": vol, "trend_eff": te, "up_frac": up_frac})

    print("=" * 78)
    print("Q1/Q2  PER-FOLD: classification vs P&L vs regime")
    print(f"{'fold':>4} {'trades':>6} {'expR':>8} {'totalR':>8} {'acc1bar':>8} "
          f"{'base':>6} {'edge_pp':>7} {'vol%':>7} {'trendEff':>8} {'up%':>6}")
    for r in fold_rows:
        print(f"{r['fold']:>4} {r['n_trades']:>6} {r['expR']:>+8.3f} {r['totalR']:>+8.2f} "
              f"{r['acc_1bar']:>8.3f} {r['baseline']:>6.3f} "
              f"{(r['acc_1bar']-r['baseline'])*100:>+7.2f} {r['vol']*100:>7.3f} "
              f"{r['trend_eff']:>8.3f} {r['up_frac']*100:>6.1f}")

    accs = np.array([a for a, _ in acc_pool]); ns = np.array([m for _, m in acc_pool])
    bases = np.array([b for b, _ in base_pool])
    pooled_acc = float(np.average(accs, weights=ns))
    pooled_base = float(np.average(bases, weights=ns))
    print(f"\nPOOLED OOS 1-bar accuracy={pooled_acc:.3f}  baseline={pooled_base:.3f}  "
          f"edge={(pooled_acc-pooled_base)*100:+.2f}pp  (N={ns.sum()})")

    print("\nQ1  COST DECOMPOSITION (is it costs, or broken before costs?)")
    pre = np.array(pre_R, dtype=float); post = np.array(post_R, dtype=float)
    print(f"  pre-cost : n={len(pre)}  expR={pre.mean():+.4f}  totalR={pre.sum():+.2f}")
    print(f"  post-cost: n={len(post)}  expR={post.mean():+.4f}  totalR={post.sum():+.2f}")
    print(f"  => cost drag = {pre.mean()-post.mean():+.4f} R/trade; "
          f"pre-cost is {'POSITIVE' if pre.mean()>0 else 'ALREADY ~0/negative'}")

    print("\nQ3  TARGET ALIGNMENT (does a correct 1-bar call win the trade?)")
    tdf = pd.DataFrame(all_trades)
    if len(tdf):
        for correct, g in tdf.groupby("correct_1bar"):
            print(f"  1-bar prediction {'CORRECT' if correct else 'WRONG  '}: "
                  f"n={len(g):3d}  trade_win={ (g.R>0).mean():.3f}  expR={g.R.mean():+.3f}")
        corr = np.corrcoef(tdf["correct_1bar"].astype(int), (tdf["R"] > 0).astype(int))[0, 1]
        print(f"  corr(1-bar correct, trade won) = {corr:+.3f}  "
              f"(near 0 => target misaligned with the SL/TP outcome)")
        won_given_correct = (tdf[tdf.correct_1bar].R > 0).mean()
        print(f"  P(trade wins | 1-bar call correct) = {won_given_correct:.3f}")


if __name__ == "__main__":
    asyncio.run(main())
