"""Phase C scalping strategy: HTF trend -> M15 location -> M5 zone -> M1 trigger.

Two pieces:
  make_htf_provider(frames) -> sync provider(m1_slice, ts) the engine calls hourly,
      computing {bias, pd_zone, zones, atr_m5} from pre-loaded H1/H4/M15/M5 frames
      (sliced causally to ts). Pre-loading keeps the sync engine fast (no per-bar DB).
  make_scalp_strategy(cfg) -> strategy_fn(ctx) the engine calls each M1 bar,
      combining the cached HTF context with a fresh M1 trigger.

Every gate maps to an existing market_context detector. See SCALP_PHASE_C_STRATEGY.md.
"""
from __future__ import annotations

import pandas as pd

from market_context.structure import market_structure
from market_context.premium_discount import premium_discount
from market_context.imbalance import active_fvgs
from market_context.liquidity import liquidity_pools
from market_context.displacement import displacement

DEFAULT_CFG = {
    "tp_pips": 5.0, "sl_pips": 4.0, "zone_atr": 0.6, "disp_mult": 1.3,
    "trigger": "either",  # "bos" | "disp" | "either"
}


# ---------------- HTF context provider (hourly) ----------------

def _upto(df: pd.DataFrame, ts, tail: int) -> pd.DataFrame:
    if df is None or df.empty:
        return pd.DataFrame()
    d = df[pd.to_datetime(df["ts"], utc=True) <= ts]
    return d.tail(tail).reset_index(drop=True)


def _atr(df: pd.DataFrame, n: int = 14) -> float | None:
    if len(df) < n + 1:
        return None
    tr = (df["h"] - df["l"]).tail(n).mean()
    return float(tr) if pd.notna(tr) else None


def make_htf_provider(frames: dict):
    """frames: {'H1':df,'H4':df,'M15':df,'M5':df} pre-loaded (ascending)."""
    def provider(m1_slice, ts) -> dict:
        h1 = _upto(frames.get("H1"), ts, 300)
        h4 = _upto(frames.get("H4"), ts, 300)
        m15 = _upto(frames.get("M15"), ts, 200)
        m5 = _upto(frames.get("M5"), ts, 300)
        if h1.empty or h4.empty or m5.empty:
            return {}
        t1 = market_structure(h1)["trend"]
        t4 = market_structure(h4)["trend"]
        if t1 == "bullish" and t4 in ("bullish", "range"):
            bias = "long"
        elif t1 == "bearish" and t4 in ("bearish", "range"):
            bias = "short"
        else:
            bias = None
        pd_zone = None
        if not m15.empty:
            pdd = premium_discount(m15, lookback=96)
            pd_zone = pdd["zone"] if pdd else None

        zones = []
        if bias:
            fvgs = active_fvgs(m5, lookback=200)
            liq = liquidity_pools(m5, order=2, lookback=200, min_touches=2)
            if bias == "long":
                zones += [{"type": "fvg", "top": f["top"], "bottom": f["bottom"]}
                          for f in fvgs if f["type"] == "bullish"]
                zones += [{"type": "swept_ssl", "top": p["level"], "bottom": p["level"]}
                          for p in liq["sell_side"] if p["swept"]]
            else:
                zones += [{"type": "fvg", "top": f["top"], "bottom": f["bottom"]}
                          for f in fvgs if f["type"] == "bearish"]
                zones += [{"type": "swept_bsl", "top": p["level"], "bottom": p["level"]}
                          for p in liq["buy_side"] if p["swept"]]
        return {"bias": bias, "pd_zone": pd_zone, "zones": zones, "atr_m5": _atr(m5)}
    return provider


# ---------------- per-bar strategy ----------------

def _location_ok(pd_zone, bias) -> bool:
    if pd_zone is None:
        return True
    if bias == "long":
        return pd_zone in ("discount", "equilibrium")
    return pd_zone in ("premium", "equilibrium")


def _nearest_zone(zones, price, atr):
    if not zones or not atr:
        return None
    best = None
    for z in zones:
        mid = (z["top"] + z["bottom"]) / 2
        if z["bottom"] - atr <= price <= z["top"] + atr:  # price in/near the zone
            d = abs(price - mid)
            if best is None or d < best[0]:
                best = (d, z)
    return best[1] if best else None


def _m1_trigger(m1: pd.DataFrame, bias: str, cfg: dict) -> bool:
    want = cfg.get("trigger", "either")
    hit = False
    if want in ("disp", "either", "momentum"):
        d = displacement(m1.tail(60), mult=cfg["disp_mult"])
        hit = hit or (d["is_displacement"] and (
            (bias == "long" and d["direction"] == "up") or
            (bias == "short" and d["direction"] == "down")))
    if want in ("bos", "either", "momentum"):
        ev = market_structure(m1.tail(60)).get("last_event")
        if ev:
            hit = hit or ((bias == "long" and ev["type"] == "bullish_bos") or
                          (bias == "short" and ev["type"] == "bearish_bos"))
    if want == "pullback":
        # reversal candle INTO the zone: a down bar then a recovering up bar (long)
        if len(m1) >= 2:
            last = m1.iloc[-1]; prev = m1.iloc[-2]
            if bias == "long":
                hit = (prev["c"] < prev["o"]) and (last["c"] > last["o"]) and (last["c"] >= prev["o"])
            else:
                hit = (prev["c"] > prev["o"]) and (last["c"] < last["o"]) and (last["c"] <= prev["o"])
    return bool(hit)


def make_scalp_strategy(cfg: dict | None = None):
    cfg = {**DEFAULT_CFG, **(cfg or {})}

    def strategy_fn(ctx):
        htf = ctx.htf or {}
        bias = htf.get("bias")
        if not bias:
            return None
        if not _location_ok(htf.get("pd_zone"), bias):
            return None
        zone = _nearest_zone(htf.get("zones"), ctx.price, htf.get("atr_m5"))
        if zone is None:
            return None
        if not _m1_trigger(ctx.m1, bias, cfg):
            return None
        return {"direction": bias, "sl_pips": cfg["sl_pips"], "tp_pips": cfg["tp_pips"],
                "reason": f"{bias}:{zone['type']}"}
    return strategy_fn
