"""Measure the REAL EUR/USD spread by hour/session from stored M1 bid/ask.

This is the number that decides whether a 5-pip scalp is even physically
possible. Run: python -m research.spread_profile [PAIR]
"""
import asyncio
import sys
import pandas as pd

from ta_engine.loader import load_candles

PAIR = sys.argv[1] if len(sys.argv) > 1 else "EUR_USD"


def _session(h):
    if 7 <= h < 12:
        return "london"
    if 12 <= h < 16:
        return "london_ny_overlap"
    if 16 <= h < 21:
        return "new_york"
    return "off_session"


async def main():
    df = await load_candles(PAIR, "M1", limit=1_000_000)
    if df.empty or df["bid_c"].isna().all():
        print(f"{PAIR}: no M1 bid/ask data — run the MBA backfill first.")
        return
    df = df.dropna(subset=["bid_c", "ask_c"]).copy()
    pip = 0.01 if PAIR.endswith("JPY") else 0.0001
    df["spread_pips"] = (df["ask_c"] - df["bid_c"]) / pip
    ts = pd.to_datetime(df["ts"], utc=True)
    df["hour"] = ts.dt.hour
    df["session"] = df["hour"].map(_session)

    print(f"{PAIR} M1 spread profile — {len(df):,} bars, "
          f"{ts.min().date()} -> {ts.max().date()}\n")

    print("BY SESSION (spread in pips)")
    print(f"{'session':>18} {'n':>9} {'median':>8} {'mean':>8} {'p90':>8} {'p99':>8}")
    for s, g in df.groupby("session"):
        sp = g["spread_pips"]
        print(f"{s:>18} {len(g):>9,} {sp.median():>8.2f} {sp.mean():>8.2f} "
              f"{sp.quantile(.9):>8.2f} {sp.quantile(.99):>8.2f}")

    print("\nBY UTC HOUR (median / p90 pips)")
    for h, g in df.groupby("hour"):
        sp = g["spread_pips"]
        bar = "#" * int(sp.median() * 5)
        print(f"  {h:02d}:00  med={sp.median():>5.2f}  p90={sp.quantile(.9):>5.2f}  {bar}")

    lon_ny = df[df["session"].isin(["london", "london_ny_overlap", "new_york"])]["spread_pips"]
    print(f"\nLondon+NY sessions: median={lon_ny.median():.2f}  p90={lon_ny.quantile(.9):.2f} pips")
    print(f"=> a 5-pip target pays ~{lon_ny.median():.2f} pips ({lon_ny.median()/5*100:.0f}% of gross) "
          f"in spread on a typical in-session trade.")


if __name__ == "__main__":
    asyncio.run(main())
