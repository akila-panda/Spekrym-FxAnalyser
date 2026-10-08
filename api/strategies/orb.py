"""Opening Range Breakout scanner. Mirrors market_context/orb_strategy.py rules
(range from bars inside [open, open+range_min), breakout on a bar CLOSE beyond
it inside the entry window, stop = range width, target = mult x range) and
emits annotations. Entry is at the breakout bar's close (known_at = bar end).
Outcome is walked forward bar by bar, SL before TP on the same bar (pessimistic),
flat at session end, net of a fixed cost in pips."""
from __future__ import annotations

from typing import Any, Optional

import numpy as np
import pandas as pd

from api.schemas import (TF_SECONDS, Annotation, Condition, Focus, Outcome, ParamSpec,
                         Point, Setup, Step, StrategyInfo, pip_size)

COST_PIPS = 1.6   # measured EUR/USD London/NY median spread (DEVELOPMENT_ROADMAP)

INFO = StrategyInfo(
    id="orb", name="Opening range breakout",
    description="Break of the first N minutes after a session open, stop at the range width.",
    supported_timeframes=["M1", "M5", "M15"], context_timeframes=["H1", "H4"],
    display_tz="UTC",
    params=[
        ParamSpec(key="session_open", label="Session open (UTC)", type="time", default="07:00"),
        ParamSpec(key="session_len_min", label="Session length (min)", type="integer",
                  default=540, min=60, max=720, step=30, help="Positions are flat at session end."),
        ParamSpec(key="mode", label="Mode", type="select", default="breakout",
                  options=["breakout", "fade"]),
        ParamSpec(key="range_min", label="Range length (min)", type="integer",
                  default=15, min=5, max=120, step=5),
        ParamSpec(key="entry_window_min", label="Entry window (min)", type="integer",
                  default=180, min=15, max=480, step=15),
        ParamSpec(key="target_mult", label="Target (x range)", type="number",
                  default=1.5, min=0.5, max=5, step=0.1),
        ParamSpec(key="min_stop_pips", label="Min range (pips)", type="number",
                  default=6.0, min=1, max=100, step=0.5),
        ParamSpec(key="max_stop_pips", label="Max range (pips)", type="number",
                  default=40.0, min=5, max=200, step=1),
        ParamSpec(key="use_vwap", label="VWAP filter", type="boolean", default=False),
        ParamSpec(key="use_volume", label="Volume filter", type="boolean", default=False),
        ParamSpec(key="vol_mult", label="Volume multiple", type="number",
                  default=1.5, min=1, max=5, step=0.1),
        ParamSpec(key="vol_lookback", label="Volume lookback (bars)", type="integer",
                  default=20, min=5, max=100, step=1),
    ],
)


def _s(ts: pd.Timestamp) -> str:
    return ts.isoformat(sep=" ")


def _tone(direction: Optional[str]) -> str:
    return {"long": "bull", "short": "bear"}.get(direction or "", "neutral")


class OrbStrategy:
    info = INFO
    cost_pips = COST_PIPS

    def scan(self, pair, tf, df, start, end, params) -> list[Setup]:
        p, pip, tfs = params, pip_size(pair), TF_SECONDS[tf]
        step = pd.Timedelta(seconds=tfs)
        if (p["range_min"] * 60) % tfs:
            from api.strategies.base import ParamError
            raise ParamError(f"range_min must be a multiple of the {tf} bar length")
        if df.empty:
            return []
        ts = df["ts"]
        setups: list[Setup] = []
        h, m = (int(x) for x in p["session_open"].split(":"))
        d, last = start.normalize(), end.normalize()      # date-granular, inclusive
        while d <= last:
            op = d + pd.Timedelta(hours=h, minutes=m)
            sess_end = op + pd.Timedelta(minutes=p["session_len_min"])
            s = self._day(pair, tf, df, ts, op, sess_end, step, pip, p, d)
            if s is not None:
                setups.append(s)
            d += pd.Timedelta(days=1)
        return setups

    # ------------------------------------------------------------------
    def _day(self, pair, tf, df, ts, op, sess_end, step, pip, p, day) -> Optional[Setup]:
        rng_end = op + pd.Timedelta(minutes=p["range_min"])
        need = int(np.ceil(p["range_min"] * 60 / step.total_seconds() * 0.8))
        rb = df[(ts >= op) & (ts < rng_end)]
        if len(rb) < need or len(rb) == 0:
            return None                                   # no data (weekend/holiday)
        hi, lo = float(rb["h"].max()), float(rb["l"].min())
        rng_pips = (hi - lo) / pip
        win_end = rng_end + pd.Timedelta(minutes=p["entry_window_min"])
        sid = f"orb-{day.date()}-{tf}"
        T = tf
        base = [
            Annotation(id=f"{sid}:range", kind="zone", role="range", tone="neutral", source_tf=T,
                       step=1, known_at=_s(rng_end), t0=_s(op), t1=_s(rng_end), p_high=hi, p_low=lo,
                       label=f"Range {rng_pips:.1f}p", why=f"High/low of {p['range_min']} min after open."),
            Annotation(id=f"{sid}:range_high", kind="level", role="range", tone="neutral", source_tf=T,
                       step=1, known_at=_s(rng_end), t0=_s(rng_end), t1=_s(sess_end), price=hi,
                       label="Range high"),
            Annotation(id=f"{sid}:range_low", kind="level", role="range", tone="neutral", source_tf=T,
                       step=1, known_at=_s(rng_end), t0=_s(rng_end), t1=_s(sess_end), price=lo,
                       label="Range low"),
            Annotation(id=f"{sid}:window", kind="window", role="window", tone="neutral", source_tf=T,
                       step=2, known_at=_s(rng_end), t0=_s(rng_end), t1=_s(win_end),
                       label="Entry window", flow="down"),
        ]
        prev = df[(ts >= op.normalize() - pd.Timedelta(days=1)) & (ts < op.normalize())]
        if len(prev):
            for nm, val in (("pdh", float(prev["h"].max())), ("pdl", float(prev["l"].min()))):
                base.append(Annotation(
                    id=f"{sid}:{nm}", kind="level", role="liquidity", tone="info", source_tf=T,
                    step=0, known_at=_s(op.normalize()), t0=_s(op.normalize()), t1=_s(sess_end),
                    price=val, label="Prior day high" if nm == "pdh" else "Prior day low",
                    flow="down"))
        steps = [Step(n=1, label="Range forms", known_at=_s(rng_end)),
                 Step(n=2, label="Window opens", known_at=_s(rng_end))]
        conds = [Condition(key="range_formed", label="Opening range formed", passed=True,
                           detail=f"{len(rb)} bars, {rng_pips:.1f} pips")]

        def rejected(why_key, label, detail, extra=None):
            conds.append(Condition(key=why_key, label=label, passed=False, detail=detail))
            end_t = win_end
            return Setup(id=sid, status="rejected", date=str(day.date()),
                         focus=Focus(start=_s(op - 4 * step), end=_s(end_t)),
                         steps=steps, conditions=conds, annotations=base + (extra or []))

        ok_size = p["min_stop_pips"] <= rng_pips <= p["max_stop_pips"]
        if not ok_size:
            return rejected("range_size", "Range size within limits",
                            f"{rng_pips:.1f} pips outside [{p['min_stop_pips']}, {p['max_stop_pips']}]")
        conds.append(Condition(key="range_size", label="Range size within limits", passed=True,
                               detail=f"{rng_pips:.1f} pips"))

        # ---- walk the entry window bar by bar (no look-ahead) ----
        sess = df[(ts >= op) & (ts < sess_end)].reset_index(drop=True)
        st = sess["ts"]
        tp_ = (sess["h"] + sess["l"] + sess["c"]) / 3.0
        cum_vwap = (tp_ * sess["v"]).cumsum() / sess["v"].cumsum().clip(lower=1e-9)
        cand = sess[(st >= rng_end) & (st < win_end)]
        broke = False
        fail_notes: list[str] = []
        for i in cand.index:
            bar = sess.loc[i]
            c = float(bar["c"])
            if c > hi:
                raw = "long"
            elif c < lo:
                raw = "short"
            else:
                continue
            broke = True
            direction = raw if p["mode"] == "breakout" else ("short" if raw == "long" else "long")
            vwap = float(cum_vwap.iloc[i])
            if p["use_vwap"] and ((direction == "long" and c < vwap) or (direction == "short" and c > vwap)):
                fail_notes.append(f"{_s(bar['ts'])}: price on wrong side of VWAP")
                continue
            if p["use_volume"]:
                prior = df[df["ts"] < bar["ts"]]["v"].tail(p["vol_lookback"])
                if len(prior) < p["vol_lookback"] or float(bar["v"]) < p["vol_mult"] * float(prior.mean()):
                    fail_notes.append(f"{_s(bar['ts'])}: volume below {p['vol_mult']}x average")
                    continue
            return self._trade(sid, tf, sess, i, direction, raw, hi, lo, rng_pips, vwap, cum_vwap,
                               sess_end, win_end, op, rng_end, step, pip, p, base, steps, conds, day)
        if not broke:
            return rejected("breakout", "Close beyond range inside window", "No bar closed beyond the range")
        conds.append(Condition(key="breakout", label="Close beyond range inside window", passed=True,
                               detail="Break occurred"))
        return rejected("filters", "Filters passed on a breakout bar", "; ".join(fail_notes[:3]))

    # ------------------------------------------------------------------
    def _trade(self, sid, tf, sess, i, direction, raw, hi, lo, rng_pips, vwap, cum_vwap, sess_end,
               win_end, op, rng_end, step, pip, p, base, steps, conds, day) -> Setup:
        bar = sess.loc[i]
        entry = float(bar["c"])
        entry_t = bar["ts"] + step                        # bar close = when it is knowable
        sl_d, tp_d = rng_pips * pip, p["target_mult"] * rng_pips * pip
        sign = 1 if direction == "long" else -1
        stop, target = entry - sign * sl_d, entry + sign * tp_d
        reason, exit_price, exit_idx = "session_end", float(sess["c"].iloc[-1]), len(sess) - 1
        for j in range(i + 1, len(sess)):
            b = sess.loc[j]
            hit_sl = b["l"] <= stop if sign == 1 else b["h"] >= stop
            hit_tp = b["h"] >= target if sign == 1 else b["l"] <= target
            if hit_sl:
                reason, exit_price, exit_idx = "sl", stop, j
                break
            if hit_tp:
                reason, exit_price, exit_idx = "tp", target, j
                break
            exit_price, exit_idx = float(b["c"]), j
        if reason == "session_end" and sess["ts"].iloc[-1] + step < sess_end:
            reason = "data_end"
        exit_t = sess["ts"].iloc[exit_idx] + step     # intrabar hit: knowable at the bar's close
        gross = sign * (exit_price - entry) / pip
        net = gross - self.cost_pips
        r = net / rng_pips
        steps = steps + [Step(n=3, label="Breakout", known_at=_s(entry_t)),
                         Step(n=4, label="Entry", known_at=_s(entry_t))]
        conds = conds + [
            Condition(key="breakout", label="Close beyond range inside window", passed=True,
                      detail=f"{raw} break at {entry:.5f}"),
            Condition(key="vwap", label="VWAP filter", passed=True if p["use_vwap"] else None,
                      detail=f"VWAP {vwap:.5f}" if p["use_vwap"] else "off"),
            Condition(key="volume", label="Volume filter", passed=True if p["use_volume"] else None,
                      detail="" if p["use_volume"] else "off"),
        ]
        ann = list(base)
        ann.append(Annotation(
            id=f"{sid}:breakout", kind="marker", role="structure", tone=_tone(raw), source_tf=tf,
            step=3, known_at=_s(entry_t), t0=_s(bar["ts"]), price=entry,
            shape="arrow_up" if raw == "long" else "arrow_down", label="Breakout",
            why="First close beyond the range inside the entry window.", flow="local"))
        if p["use_vwap"]:
            pts = [Point(t=_s(t), p=float(v)) for t, v in zip(sess["ts"].iloc[: i + 1], cum_vwap.iloc[: i + 1])]
            ann.append(Annotation(id=f"{sid}:vwap", kind="polyline", role="filter", tone="info",
                                  source_tf=tf, step=3, known_at=_s(entry_t), points=pts,
                                  label="VWAP", flow="local"))
        ann.append(Annotation(
            id=f"{sid}:trade", kind="trade", role="entry", tone=_tone(direction), source_tf=tf,
            step=4, known_at=_s(entry_t), t0=_s(entry_t), t1=_s(exit_t), direction=direction,
            entry=entry, stop=stop, target=target, exit_time=_s(exit_t), exit_price=exit_price,
            label=f"{r:+.2f}R", emphasis="strong", flow="all",
            why=f"{'Breakout' if p['mode']=='breakout' else 'Fade'} {direction}; exit {reason}."))
        result = "win" if net > 0 else ("loss" if net < 0 else "flat")
        return Setup(
            id=sid, status="valid", direction=direction, date=str(day.date()),
            focus=Focus(start=_s(op - 4 * step), end=_s(exit_t + 8 * step)),
            steps=steps, conditions=conds, annotations=ann,
            outcome=Outcome(result=result, r_multiple=round(r, 4), net_pips=round(net, 3),
                            cost_pips=self.cost_pips, exit_reason=reason,
                            bars_held=int(exit_idx - i)))