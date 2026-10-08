"""Instrument registry: pip/point size, asset class, OANDA symbol per instrument.
Feeds the engine's per-instrument `pip` and QA session logic (see DATA_ACQUISITION_PLAN)."""
from __future__ import annotations

FX_MAJORS = ["EUR_USD", "GBP_USD", "USD_JPY", "USD_CHF", "AUD_USD", "USD_CAD", "NZD_USD"]
TIMEFRAMES = ["M1", "M5", "M15", "H1", "H4", "D", "W"]

REGISTRY: dict[str, dict] = {}


def _reg(sym, pip, asset, session="24x5"):
    REGISTRY[sym] = {"oanda": sym, "pip": pip, "asset": asset, "session": session}


for _s in FX_MAJORS:
    _reg(_s, 0.01 if _s.endswith("JPY") else 0.0001, "fx")
# Phase-2 instruments (registered now; fetched later)
_reg("XAU_USD", 0.1, "metal"); _reg("XAG_USD", 0.01, "metal")
_reg("BCO_USD", 0.01, "energy"); _reg("WTICO_USD", 0.01, "energy")
_reg("USB10Y_USD", 0.001, "bond"); _reg("USB02Y_USD", 0.001, "bond")
for _s in ("SPX500_USD", "US30_USD", "DE30_EUR", "UK100_GBP", "JP225_USD", "NAS100_USD"):
    _reg(_s, 1.0, "index", "cash")
for _s in ("EUR_GBP", "EUR_JPY"):
    _reg(_s, 0.01 if _s.endswith("JPY") else 0.0001, "fx")


def get(instrument: str) -> dict:
    if instrument not in REGISTRY:
        raise KeyError(f"{instrument} not in registry")
    return REGISTRY[instrument]


def pip(instrument: str) -> float:
    return get(instrument)["pip"]
