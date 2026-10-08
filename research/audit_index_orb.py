"""Forensic audit of NAS100_USD index-ORB TRAIN trades (read-only, vault sealed).
Regenerates per-trade logs from the registered specs, recomputes everything, and
writes CSVs + INDEX_ORB_AUDIT.md. Numbers come only from the engine's trades.
Run: python -m research.audit_index_orb
"""
import asyncio
from pathlib import Path
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd

from engine.datacache import load_split_cached
from engine.runner import Hypothesis, run
from market_context.index_orb_strategy import make_index_orb_strategy

ET = ZoneInfo("America/New_York")
PAIR, TM, PIP, LIMIT = "NAS100_USD", 1.5, 1.0, 300_000
ENGINE = dict(sessions=(("13:30", "21:00"),), max_hold_min=180, pip=PIP)
REPORTED = {"idx_breakout_15": 4.61, "idx_breakout_15_retest": 13.51,
            "idx_fade_15": -5.27, "idx_breakout_30": -7.46, "idx_fade_30": -19.19}
VARIANTS = [
    ("idx_breakout_15", {"range_min": 15, "mode": "breakout"}),
    ("idx_breakout_15_retest", {"range_min": 15, "mode": "breakout", "require_retest": True}),
    ("idx_breakout_15_relvol", {"range_min": 15, "mode": "breakout", "use_relvol": True}),
    ("idx_fade_15", {"range_min": 15, "mode": "fade"}),
    ("idx_breakout_30", {"range_min": 30, "mode": "breakout"}),
    ("idx_fade_30", {"range_min": 30, "mode": "fade"}),
]
OUT = Path(__file__).resolve().parent / "audit"
OUT.mkdir(exist_ok=True)


def _et(ts):
    return pd.to_datetime(ts, utc=True).tz_convert(ET)


def _trades_df(name, res):
    rows = []
    cum = 0.0
    for i, t in enumerate(sorted(res.trades, key=lambda x: x.entry_ts), 1):
        sl = abs(t.net_pips / t.R) if t.R else float("nan")      # range (pts)
        if t.direction == "long":
            stop, tgt = t.entry - sl * PIP, t.entry + TM * sl * PIP
        else:
            stop, tgt = t.entry + sl * PIP, t.entry - TM * sl * PIP
        et_in, et_out = _et(t.entry_ts), _et(t.exit_ts)
        spread = t.spread_at_entry
        net = t.net_pips
        cum += net
        rows.append(dict(variant=name, trade=i, date=str(et_in.date()),
                         weekday=et_in.strftime("%a"), direction=t.direction,
                         entry_et=et_in.strftime("%H:%M"), entry=round(t.entry, 1),
                         stop=round(stop, 1), target=round(tgt, 1),
                         exit_et=et_out.strftime("%H:%M"), exit=round(t.exit, 1),
                         exit_reason=t.exit_reason, hold_min=t.hold_min,
                         range_pts=round(sl, 1), gross_pts=round(net + spread, 2),
                         spread_pts=round(spread, 2), net_pts=round(net, 2),
                         net_usd=round(t.pnl_usd, 2), R=round(t.R, 2),
                         cum_net=round(cum, 2), result="W" if net > 0 else "L"))
    return pd.DataFrame(rows)


def _summary(name, d):
    if d.empty:
        return dict(variant=name, trades=0)
    net = d["net_pts"].to_numpy()
    wins, losses = net[net > 0], net[net <= 0]
    cum = np.cumsum(net)
    dd = float((np.maximum.accumulate(cum) - cum).max())
    streak = mx = 0
    for x in net:
        streak = streak + 1 if x <= 0 else 0
        mx = max(mx, streak)
    pf = wins.sum() / abs(losses.sum()) if losses.sum() != 0 else float("inf")
    return dict(variant=name, trades=len(d), wins=int((net > 0).sum()),
                losses=int((net <= 0).sum()), win_pct=round((net > 0).mean(), 3),
                avg_win=round(wins.mean(), 2) if len(wins) else 0.0,
                avg_loss=round(losses.mean(), 2) if len(losses) else 0.0,
                expectancy=round(net.mean(), 2), total_pts=round(net.sum(), 1),
                total_usd=round(d["net_usd"].sum(), 0), profit_factor=round(pf, 2),
                max_dd_pts=round(dd, 1), longest_loss_streak=mx,
                best=round(net.max(), 1), worst=round(net.min(), 1),
                long_total=round(d[d.direction == "long"]["net_pts"].sum(), 1),
                short_total=round(d[d.direction == "short"]["net_pts"].sum(), 1))


def _md(df):
    return df.to_markdown(index=False)


async def main():
    df = await load_split_cached(PAIR, "M1", "train", limit=LIMIT)
    alld, summ = {}, []
    for name, cfg in VARIANTS:
        res = run(Hypothesis(name, make_index_orb_strategy({**cfg, "target_mult": TM}),
                             PAIR, engine_kwargs={**ENGINE, "max_spread_pips": 6.9}), df)
        d = _trades_df(name, res)
        d.to_csv(OUT / f"{name}.csv", index=False)
        alld[name] = d
        summ.append(_summary(name, d))
    S = pd.DataFrame(summ)

    lines = ["# NAS100 index-ORB — TRAIN audit (read-only, vault sealed)\n",
             f"Source: cached NAS100_USD M1 TRAIN, {len(df)} bars. P/L in points after real "
             f"bid/ask spread. $1/point. Per-trade CSVs in research/audit/.\n",
             "## TASK 2 — Summary (recomputed)\n", _md(S), "\n"]

    chk = ["## TASK 4 — Checks\n", "**Expectancy recompute vs reported:**\n"]
    rows = []
    for name, rep in REPORTED.items():
        got = alld[name]["net_pts"].mean() if not alld[name].empty else float("nan")
        rows.append({"variant": name, "reported": rep, "recomputed": round(got, 2),
                     "match": "OK" if abs(got - rep) < 0.05 else "MISMATCH"})
    chk.append(_md(pd.DataFrame(rows)))
    conc = []
    for name, d in alld.items():
        if d.empty:
            continue
        net = np.sort(d["net_pts"].to_numpy())[::-1]
        tot, top5 = net.sum(), net[:5].sum()
        conc.append({"variant": name, "total_pts": round(tot, 1), "top5_pts": round(top5, 1),
                     "top5_share": "n/a" if tot == 0 else f"{top5/tot:.0%}"})
    chk += ["\n**Top-5-trade concentration:**\n", _md(pd.DataFrame(conc))]
    a, b = alld["idx_breakout_15"], alld["idx_breakout_15_retest"]
    ov = len(set(a["date"]) & set(b["date"])) if not a.empty and not b.empty else 0
    chk.append(f"\n**Overlap breakout_15 ∩ retest (same session date):** {ov} "
               f"(n={len(a)}/{len(b)}).\n")
    sens = []
    for name, d in alld.items():
        if d.empty:
            continue
        g = d["gross_pts"].mean()
        sens.append({"variant": name, "exp@1.1": round(g - 1.1, 2),
                     "exp@actual": round(d["net_pts"].mean(), 2), "exp@3.5": round(g - 3.5, 2)})
    chk += ["**Expectancy vs spread assumption (pts/trade):**\n", _md(pd.DataFrame(sens))]
    odd = []
    for name, d in alld.items():
        if d.empty:
            continue
        outside = d[(d.entry_et < "09:30") | (d.entry_et > "16:00")]
        odd.append({"variant": name, "entries_outside_0930_1600": len(outside),
                    "duplicate_rows": int(d.duplicated(subset=["date", "entry_et", "direction"]).sum()),
                    "missing_exit": int(d["exit"].isna().sum())})
    chk += ["\n**Oddities:**\n", _md(pd.DataFrame(odd))]

    bd = ["## TASK 3 — Breakdowns (breakout_15 & retest; full data in CSVs)\n"]
    for name in ("idx_breakout_15", "idx_breakout_15_retest"):
        d = alld[name]
        if d.empty:
            continue
        d = d.assign(month=d["date"].str.slice(0, 7))
        bd.append(f"### {name}\nby month:\n" + _md(
            d.groupby("month")["net_pts"].agg(["count", "sum"]).round(1).reset_index()))
        bd.append("\nby weekday:\n" + _md(
            d.groupby("weekday")["net_pts"].agg(["count", "sum"]).round(1).reset_index()))
        bd.append("\nby exit reason:\n" + _md(
            d.groupby("exit_reason")["net_pts"].agg(["count", "sum"]).round(1).reset_index()) + "\n")

    samp = ["## TASK 1 — sample (first 5 trades of breakout_15_retest; full in CSV)\n",
            _md(alld["idx_breakout_15_retest"].head(5))]

    report = "\n".join(lines + samp + ["\n"] + bd + ["\n"] + chk)
    (OUT / "INDEX_ORB_AUDIT.md").write_text(report)
    print(report)


if __name__ == "__main__":
    asyncio.run(main())
