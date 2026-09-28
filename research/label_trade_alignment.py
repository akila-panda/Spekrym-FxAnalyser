"""Forecast label vs actual TP/SL trade-outcome alignment audit (research only).

Does the 1-bar future-return training label represent the event the engine
actually monetizes (TP before SL, after costs)? Reconstructs, for every forecast
trade across the 5 walk-forward folds, the independent price path (TP_FIRST /
SL_FIRST / NEITHER / BOTH_SAME_BAR), MAE/MFE, hit-times, label vs outcome, and
gross vs net R. Writes LABEL_TRADE_ALIGNMENT.csv. Changes NO production code.

Run: python -m research.label_trade_alignment
"""
import asyncio
import numpy as np
import pandas as pd

from ta_engine.loader import load_candles
from forecast.features import build_feature_frame, build_dataset, make_labels
from forecast.model import ForecastModel
from backtest.engine import run_backtest

PAIR, TF, LIMIT, HORIZON = "EUR_USD", "H1", 15000, 1
N_FOLDS, MIN_TRAIN_FRAC, WARMUP, THR = 5, 0.5, 60, 0.45
SPREAD, SLIP = 0.6, 0.1
CLS = {1: "up", -1: "down", 0: "flat"}


def _strategy(pred_by_ts, thr):
    def s(window_df):
        p = pred_by_ts.get(str(window_df["ts"].iloc[-1]))
        if not p or p["predicted_class"] == "flat" or p["confidence"] < thr:
            return None
        return {"direction": "long" if p["predicted_class"] == "up" else "short"}
    return s


def _replay(h, l, entry_i, direction, sl, tp, n):
    """Independent forward path from entry_i+1 until SL/TP/data-end.
    Returns (outcome, time_to_tp, time_to_sl, both_same_bar, exit_bar)."""
    outcome, both = "NEITHER", False
    t_tp = t_sl = None
    exit_bar = n - 1
    for j in range(entry_i + 1, n):
        hi, lo = h[j], l[j]
        if direction == "long":
            hit_sl, hit_tp = lo <= sl, hi >= tp
        else:
            hit_sl, hit_tp = hi >= sl, lo <= tp
        if hit_sl and hit_tp:
            outcome, both, exit_bar, t_sl = "SL_FIRST", True, j, j - entry_i
            break
        if hit_sl:
            outcome, exit_bar, t_sl = "SL_FIRST", j, j - entry_i
            break
        if hit_tp:
            outcome, exit_bar, t_tp = "TP_FIRST", j, j - entry_i
            break
    return outcome, t_tp, t_sl, both, exit_bar


async def main():
    df = await load_candles(PAIR, TF, limit=LIMIT)
    feats = build_feature_frame(df)
    labels = make_labels(df, horizon=HORIZON)
    ts_all = df["ts"].astype(str).tolist()
    h = df["h"].to_numpy(float); l = df["l"].to_numpy(float); c = df["c"].to_numpy(float)
    n = len(df)
    min_train = int(n * MIN_TRAIN_FRAC)
    fold_size = (n - min_train) // N_FOLDS

    rows = []
    tid = 0
    for i in range(N_FOLDS):
        tr_end = min_train + i * fold_size
        te_end = min(tr_end + fold_size, n)
        if te_end <= tr_end:
            break
        X, y = build_dataset(df.iloc[:tr_end], horizon=HORIZON)
        model = ForecastModel(PAIR, TF, HORIZON).fit(X, y)
        pred_by_ts = {}
        for idx in range(tr_end, te_end):
            frow = feats.iloc[[idx]]
            if frow.isna().any(axis=1).iloc[0]:
                continue
            pred_by_ts[ts_all[idx]] = model.predict_distribution(frow)

        fold_df = df.iloc[tr_end - WARMUP: te_end].reset_index(drop=True)
        res = run_backtest(fold_df, _strategy(pred_by_ts, THR), window=WARMUP,
                           pair=PAIR, spread_pips=SPREAD, slippage_pips=SLIP)
        res_g = run_backtest(fold_df, _strategy(pred_by_ts, THR), window=WARMUP,
                             pair=PAIR, spread_pips=0.0, slippage_pips=0.0)
        gross_by_idx = {t.entry_index: t.r_multiple for t in res_g.trades}
        offset = tr_end - WARMUP

        for t in res.trades:
            gk = offset + t.entry_index
            p = pred_by_ts.get(ts_all[gk - 1], {})
            dist = p.get("distribution", {})
            risk = abs(t.entry - t.sl) or np.nan
            outcome, t_tp, t_sl, both, exit_bar = _replay(h, l, gk, t.direction, t.sl, t.tp, n)
            seg_hi = h[gk: exit_bar + 1]; seg_lo = l[gk: exit_bar + 1]
            if t.direction == "long":
                mfe = (seg_hi.max() - t.entry) / risk
                mae = (t.entry - seg_lo.min()) / risk
                t_mfe = int(np.argmax(seg_hi)); t_mae = int(np.argmin(seg_lo))
            else:
                mfe = (t.entry - seg_lo.min()) / risk
                mae = (seg_hi.max() - t.entry) / risk
                t_mfe = int(np.argmin(seg_lo)); t_mae = int(np.argmax(seg_hi))
            lab = labels.iloc[gk - 1]
            fut_ret = (c[gk] / c[gk - 1] - 1.0)
            gross = gross_by_idx.get(t.entry_index, np.nan)
            net = t.r_multiple
            rows.append({
                "trade_id": tid, "fold": i, "entry_ts": t.entry_ts,
                "direction": t.direction, "predicted_class": p.get("predicted_class"),
                "p_up": dist.get("up"), "p_down": dist.get("down"), "p_flat": dist.get("flat"),
                "confidence": p.get("confidence"),
                "label_horizon": HORIZON, "label_return": fut_ret,
                "label_class": CLS.get(int(lab)) if pd.notna(lab) else None,
                "sl": t.sl, "tp": t.tp,
                "tp_first": outcome == "TP_FIRST", "sl_first": outcome == "SL_FIRST",
                "neither": outcome == "NEITHER", "both_same_bar": both,
                "actual_exit_reason": t.exit_reason,
                "holding_bars": (t.exit_index - t.entry_index) if t.exit_index else None,
                "holding_hours": (t.exit_index - t.entry_index) if t.exit_index else None,
                "future_return": fut_ret, "mae": mae, "mfe": mfe,
                "time_to_mae": t_mae, "time_to_mfe": t_mfe,
                "time_to_tp": t_tp, "time_to_sl": t_sl,
                "gross_R": gross, "spread_cost_R": (gross - net) if pd.notna(gross) else None,
                "slippage_cost_R": None, "net_R": net,
            })
            tid += 1

    tdf = pd.DataFrame(rows)
    tdf.to_csv("LABEL_TRADE_ALIGNMENT.csv", index=False)
    print(f"trades reconstructed: {len(tdf)}  -> LABEL_TRADE_ALIGNMENT.csv\n")

    def oc(r):
        return "TP_first" if r.tp_first else ("SL_first" if r.sl_first else "neither")
    tdf["outcome"] = tdf.apply(oc, axis=1)
    print("CONFUSION  label_class (rows) x outcome (cols)")
    print(pd.crosstab(tdf["label_class"], tdf["outcome"], margins=True))
    print("\nPredicted-direction vs outcome (traded only):")
    print(pd.crosstab(tdf["predicted_class"], tdf["outcome"], margins=True))

    dir_correct = tdf["predicted_class"] == tdf["label_class"]
    print("\nDECOMPOSITION  direction -> path -> economic")
    print(f"  A direction (1-bar) accuracy on traded set: {dir_correct.mean():.3f}")
    print(f"  B TP-first rate                            : {tdf.tp_first.mean():.3f}")
    print(f"  B SL-first rate                            : {tdf.sl_first.mean():.3f}")
    print(f"  B neither rate                             : {tdf.neither.mean():.3f}")
    print(f"  C net expectancy R                         : {tdf.net_R.mean():+.4f}")
    print(f"    gross expectancy R                       : {tdf.gross_R.mean():+.4f}")

    tdf["dir_ok"] = dir_correct
    t1 = ((tdf.dir_ok) & (tdf.tp_first)).sum()
    t2 = ((tdf.dir_ok) & (tdf.sl_first)).sum()
    t3 = ((~tdf.dir_ok) & (tdf.tp_first)).sum()
    t4 = ((tdf.dir_ok) & (~tdf.tp_first)).sum()
    print("\nTYPE ANALYSIS (label vs trade)")
    print(f"  Type1 label-correct & TP-first : {t1}")
    print(f"  Type2 label-correct & SL-first : {t2}  <-- correct call, lost trade")
    print(f"  Type3 label-wrong & TP-first   : {t3}")
    print(f"  Type4 label-correct & not TP   : {t4}")

    hb = tdf["holding_bars"].dropna()
    print("\nHORIZON ALIGNMENT (label horizon = 1 bar)")
    print(f"  median holding bars={hb.median():.0f}  mean={hb.mean():.1f}")
    print(f"  % exiting after label horizon (>1 bar): {(hb > 1).mean()*100:.1f}%")
    print(f"  % resolved within label horizon (<=1) : {(hb <= 1).mean()*100:.1f}%")

    print("\nPER-FOLD")
    for f, g in tdf.groupby("fold"):
        print(f"  fold {f}: n={len(g):3d}  dir_acc={ (g.predicted_class==g.label_class).mean():.3f} "
              f"TP_first={g.tp_first.mean():.3f}  net_expR={g.net_R.mean():+.3f}  "
              f"gross_expR={g.gross_R.mean():+.3f}  med_hold={g.holding_bars.median():.0f}")

    print("\nCOST")
    print(f"  gross expR={tdf.gross_R.mean():+.4f}  net expR={tdf.net_R.mean():+.4f}  "
          f"cost drag={tdf.gross_R.mean()-tdf.net_R.mean():+.4f} R/trade")


if __name__ == "__main__":
    asyncio.run(main())
