import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from api.datasource import InMemorySource
from api.main import create_app


def _m1(days=("2025-05-06", "2025-05-07"), crafted=True) -> pd.DataFrame:
    rows = []
    for d in days:
        for t in pd.date_range(f"{d} 05:00", f"{d} 18:00", freq="1min", tz="UTC", inclusive="left"):
            rows.append((t, 1.1005, 1.1005, 1.1005, 1.1005, 100.0))
    df = pd.DataFrame(rows, columns=["ts", "o", "h", "l", "c", "v"])
    if crafted:                          # day 2: 10 pip range, up-break, TP next bar
        d = days[-1]
        rng = (df.ts >= f"{d} 07:00") & (df.ts < f"{d} 07:15")
        df.loc[rng, "h"] = 1.1010
        df.loc[rng, "l"] = 1.1000
        i = df.index[df.ts == pd.Timestamp(f"{d} 07:15", tz="UTC")][0]
        df.loc[i, ["h", "c"]] = [1.1013, 1.1012]
        df.loc[i + 1, ["h", "c"]] = [1.1030, 1.1028]
    return df


def _agg(m1: pd.DataFrame, rule: str) -> pd.DataFrame:
    return (m1.set_index("ts").resample(rule).agg(
        {"o": "first", "h": "max", "l": "min", "c": "last", "v": "sum"}).dropna().reset_index())


@pytest.fixture()
def client():
    m1 = _m1()
    src = InMemorySource({"EUR_USD": {"M1": m1, "M5": _agg(m1, "5min"),
                                      "M15": _agg(m1, "15min"), "H1": _agg(m1, "1h")}})
    return TestClient(create_app(src))


def _scan(client, **kw):
    body = {"strategy_id": "orb", "pair": "EUR_USD", "timeframe": "M1",
            "from": "2025-05-06", "to": "2025-05-07", "params": {}}
    body.update(kw)
    return client.post("/api/scan", json=body)


def test_strategies_catalog(client):
    r = client.get("/api/strategies").json()
    orb = r[0]
    assert orb["id"] == "orb" and orb["supported_timeframes"] == ["M1", "M5", "M15"]
    assert {p["key"] for p in orb["params"]} >= {"session_open", "range_min", "target_mult"}


def test_candles_ascending_and_h4_matches_h1(client):
    c = client.get("/api/candles", params={"pair": "EUR_USD", "tf": "M1", "from": "2025-05-07",
                                           "to": "2025-05-07T08:00:00"}).json()["candles"]
    ts = [x["t"] for x in c]
    assert ts == sorted(ts) and len(ts) > 0
    h4 = client.get("/api/candles", params={"pair": "EUR_USD", "tf": "H4"}).json()["candles"]
    h1 = client.get("/api/candles", params={"pair": "EUR_USD", "tf": "H1"}).json()["candles"]
    first = [x for x in h1 if "2025-05-06 08:00" <= x["t"] < "2025-05-06 12:00"]
    b = next(x for x in h4 if x["t"].startswith("2025-05-06 08:00"))
    assert b["h"] == max(x["h"] for x in first) and b["l"] == min(x["l"] for x in first)
    assert b["v"] == pytest.approx(sum(x["v"] for x in first))


def test_bounds(client):
    b = client.get("/api/bounds", params={"pair": "EUR_USD"}).json()["bounds"]
    assert b["M1"]["first"].startswith("2025-05-06 05:00") and b["H4"]["first"] is not None


def test_scan_known_trade(client):
    r = _scan(client)
    assert r.status_code == 200
    j = r.json()
    valid = [s for s in j["setups"] if s["status"] == "valid"]
    assert len(valid) == 1 and valid[0]["date"] == "2025-05-07"
    s = valid[0]
    assert s["direction"] == "long" and s["outcome"]["exit_reason"] == "tp"
    # entry 1.1012, range 10p, target 15p, cost 1.6 -> net 13.4p, R 1.34
    assert s["outcome"]["net_pips"] == pytest.approx(13.4, abs=0.05)
    assert s["outcome"]["r_multiple"] == pytest.approx(1.34, abs=0.01)
    t = next(a for a in s["annotations"] if a["kind"] == "trade")
    assert t["stop"] == pytest.approx(1.1002) and t["target"] == pytest.approx(1.1027)
    assert t["exit_time"] > t["t0"]               # never a zero-width trade box
    assert j["summary"]["n_valid"] == 1 and j["summary"]["n_rejected"] == 1
    assert j["summary"]["expectancy_r"] == pytest.approx(1.34, abs=0.01)
    assert any("not validated" in w for w in j["warnings"])


def test_scan_integrity(client):
    j = _scan(client).json()
    ids = [a["id"] for s in j["setups"] for a in s["annotations"]]
    assert len(ids) == len(set(ids))
    for s in j["setups"]:
        steps = {x["n"] for x in s["steps"]}
        for a in s["annotations"]:
            assert a["step"] == 0 or a["step"] in steps
    s = next(x for x in j["setups"] if x["status"] == "valid")
    brk = next(a for a in s["annotations"] if a["role"] == "structure")
    trade = next(a for a in s["annotations"] if a["kind"] == "trade")
    assert trade["known_at"] > brk["t0"]          # entry knowable only after the bar closes
    assert s["focus"]["from"] < s["focus"]["to"]


def test_rejected_has_failed_condition(client):
    s = next(x for x in _scan(client).json()["setups"] if x["status"] == "rejected")
    assert any(c["passed"] is False for c in s["conditions"])


def test_scan_errors(client):
    assert _scan(client, timeframe="H1").status_code == 422
    assert _scan(client, strategy_id="nope").status_code == 404
    assert _scan(client, params={"range_min": 3}).status_code == 422
    assert _scan(client, params={"bogus": 1}).status_code == 422
    assert _scan(client, params={"range_min": 20}, timeframe="M15").status_code == 422
    assert _scan(client, **{"from": "2025-05-08", "to": "2025-05-07"}).status_code == 422
    assert _scan(client, pair="XXX_YYY").status_code == 422


def test_scan_m5_and_fade(client):
    assert _scan(client, timeframe="M5").status_code == 200
    j = _scan(client, params={"mode": "fade"}).json()
    s = next(x for x in j["setups"] if x["status"] == "valid")
    assert s["direction"] == "short"