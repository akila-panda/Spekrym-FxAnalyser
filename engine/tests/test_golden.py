"""Golden regression suite — deterministic strategies whose P&L is computed by
hand. Any future change to scalp_engine / runner / cost model must reproduce
these exact numbers. (KNOWN_NEGATIVE, COST_CHEAT, LOOKAHEAD and POSITIVE_SYNTHETIC
already live in test_runner / test_adversarial / test_judge; this file adds the
hand-calculated VARIABLE_EXIT and SESSION_EXIT cases ChatGPT flagged.)

Setup for every case: flat mid = 1.10000, 2-pip spread → bid 1.09990 / ask 1.10010.
Enter long at k=1 → fill next bar open at ask = 1.10010.
"""
import pandas as pd

from engine.runner import Hypothesis, run

PIP = 0.0001
MID = 1.10000
HALF = 1.0 * PIP          # 2-pip spread → half = 1 pip


def _frame(n, triggers=None):
    """n flat minute bars from 07:00; `triggers[i]` overrides bar i's bid_h/bid_l
    to force a TP/SL touch at a known price."""
    rows = []
    start = pd.Timestamp("2024-01-02 07:00", tz="UTC")
    for i in range(n):
        ts = start + pd.Timedelta(minutes=i)
        row = {"ts": ts, "o": MID, "h": MID, "l": MID, "c": MID, "v": 1,
               "bid_o": MID - HALF, "bid_h": MID - HALF, "bid_l": MID - HALF, "bid_c": MID - HALF,
               "ask_o": MID + HALF, "ask_h": MID + HALF, "ask_l": MID + HALF, "ask_c": MID + HALF}
        if triggers and i in triggers:
            row.update(triggers[i])
        rows.append(row)
    return pd.DataFrame(rows)


def _enter_once(tp, sl):
    state = {"done": False}

    def strat(ctx):
        if ctx.k == 1 and not state["done"]:
            state["done"] = True
            return {"direction": "long", "tp_pips": tp, "sl_pips": sl}
        return None
    return strat


def _run(frame, tp, sl, sessions=(("07:00", "16:00"),), **kw):
    hyp = Hypothesis("golden", _enter_once(tp, sl),
                     engine_kwargs=dict(sessions=sessions, max_spread_pips=5.0, **kw))
    return run(hyp, frame)


def test_golden_tp_exit():
    # entry ask 1.10010, tp +10 = 1.10110; bar 3 bid_h touches it
    res = _run(_frame(5, {3: {"bid_h": 1.10120}}), tp=10, sl=5)
    t = res.trades[0]
    assert t.exit_reason == "tp"
    assert round(t.net_pips, 1) == 10.0          # exactly +tp
    assert round(t.R, 2) == 2.0                  # tp/sl = 10/5


def test_golden_sl_exit():
    # entry ask 1.10010, sl -5 = 1.09960; bar 3 bid_l touches it
    res = _run(_frame(5, {3: {"bid_l": 1.09950}}), tp=10, sl=5)
    t = res.trades[0]
    assert t.exit_reason == "sl"
    assert round(t.net_pips, 1) == -5.0          # exactly -sl
    assert round(t.R, 2) == -1.0


def test_golden_session_exit_pays_exactly_the_spread():
    # no TP/SL touch; session ends 07:05 → flat at bid_c. Entry ask 1.10010,
    # exit bid 1.09990 → net = -2 pips = the full spread, nothing else.
    res = _run(_frame(7), tp=50, sl=50, sessions=(("07:00", "07:05"),))
    t = res.trades[0]
    assert t.exit_reason == "session_end"
    assert round(t.net_pips, 1) == -2.0


def test_golden_session_exit_with_slippage():
    # same, plus 0.5-pip slippage on entry and exit → -2 - (2 × 0.5) = -3 pips
    res = _run(_frame(7), tp=50, sl=50, sessions=(("07:00", "07:05"),),
               slippage_pips=0.5)
    assert round(res.trades[0].net_pips, 1) == -3.0
