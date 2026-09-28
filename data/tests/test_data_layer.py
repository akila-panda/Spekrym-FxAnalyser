"""Unit tests for the Phase 0 data layer's pure logic -- no DB or network.

Covers the pieces every downstream phase depends on: the OANDA circuit
breaker, the FX market-hours calendar used for gap detection, and the two
parsers that turn raw API payloads into DB rows.
"""
from datetime import datetime, timezone

import httpx

from data.oanda_client import CircuitBreaker, _is_retryable as oanda_is_retryable
from data.validation import _is_market_closed
from data.fetch_calendar import (
    _parse_event, _event_id, RELEVANT_CURRENCIES, _is_retryable as cal_is_retryable,
)
from data.fetch_ohlcv import _to_row


# --- circuit breaker -------------------------------------------------------

def test_circuit_breaker_opens_after_threshold():
    cb = CircuitBreaker(fail_threshold=3, cooldown_s=60)
    assert cb.allow() is True
    for _ in range(3):
        cb.record_failure()
    assert cb.allow() is False  # open, still within cooldown


def test_circuit_breaker_closes_after_cooldown():
    cb = CircuitBreaker(fail_threshold=2, cooldown_s=60)
    cb.record_failure()
    cb.record_failure()
    assert cb.allow() is False
    # simulate the cooldown having elapsed
    cb.opened_at -= 61
    assert cb.allow() is True   # half-open -> allowed, counters reset
    assert cb.failures == 0
    assert cb.opened_at is None


def test_circuit_breaker_success_resets_failures():
    cb = CircuitBreaker(fail_threshold=3)
    cb.record_failure()
    cb.record_failure()
    cb.record_success()
    assert cb.failures == 0
    assert cb.opened_at is None


# --- FX market hours (Fri 21:00 UTC -> Sun 21:00 UTC closed) ---------------

def test_market_open_weekday():
    # Wednesday 10:00 UTC
    assert _is_market_closed(datetime(2026, 9, 23, 10, tzinfo=timezone.utc)) is False


def test_market_closed_saturday():
    assert _is_market_closed(datetime(2026, 9, 26, 12, tzinfo=timezone.utc)) is True


def test_market_closed_friday_evening_but_open_friday_morning():
    assert _is_market_closed(datetime(2026, 9, 25, 22, tzinfo=timezone.utc)) is True   # Fri 22:00
    assert _is_market_closed(datetime(2026, 9, 25, 10, tzinfo=timezone.utc)) is False  # Fri 10:00


def test_market_sunday_before_and_after_open():
    assert _is_market_closed(datetime(2026, 9, 27, 20, tzinfo=timezone.utc)) is True   # Sun 20:00 closed
    assert _is_market_closed(datetime(2026, 9, 27, 21, tzinfo=timezone.utc)) is False  # Sun 21:00 open


# --- calendar event parsing ------------------------------------------------

def _raw_event(**over):
    base = {
        "country": "USD",
        "date": "2026-09-23T12:30:00+00:00",
        "title": "Core CPI m/m",
        "impact": "High",
        "actual": "0.3%",
        "forecast": "0.2%",
        "previous": "0.1%",
    }
    base.update(over)
    return base


def test_parse_event_maps_fields():
    row = _parse_event(_raw_event())
    assert row["currency"] == "USD"
    assert row["title"] == "Core CPI m/m"
    assert row["impact"] == "High"
    assert row["actual"] == "0.3%"
    assert row["ts"] == datetime(2026, 9, 23, 12, 30, tzinfo=timezone.utc)
    assert row["source"] == "forexfactory"


def test_parse_event_filters_irrelevant_currency():
    assert _parse_event(_raw_event(country="CHF")) is None
    # sanity: the fixture currency is one we do track
    assert "USD" in RELEVANT_CURRENCIES


def test_parse_event_id_is_deterministic():
    a = _parse_event(_raw_event())
    b = _parse_event(_raw_event())
    assert a["id"] == b["id"]
    # id is derived from currency|title|ts
    assert a["id"] == _event_id("USD", "Core CPI m/m",
                                datetime(2026, 9, 23, 12, 30, tzinfo=timezone.utc))


def test_parse_event_empty_strings_become_none():
    row = _parse_event(_raw_event(actual="", forecast="", previous=""))
    assert row["actual"] is None
    assert row["forecast"] is None
    assert row["previous"] is None


def test_parse_event_bad_date_returns_none():
    assert _parse_event(_raw_event(date="not-a-date")) is None


# --- OHLCV candle row mapping ----------------------------------------------

def test_to_row_maps_oanda_candle():
    candle = {
        "time": "2026-09-23T10:00:00.000000000Z",
        "mid": {"o": "1.10000", "h": "1.11000", "l": "1.09000", "c": "1.10500"},
        "volume": 1234,
        "complete": True,
    }
    row = _to_row("EUR_USD", candle)
    assert row["pair"] == "EUR_USD"
    assert row["o"] == 1.10 and row["h"] == 1.11 and row["l"] == 1.09 and row["c"] == 1.105
    assert row["v"] == 1234
    assert row["complete"] is True
    assert row["ts"] == datetime(2026, 9, 23, 10, tzinfo=timezone.utc)


def test_to_row_incomplete_flag_preserved():
    candle = {
        "time": "2026-09-23T11:00:00.000000000Z",
        "mid": {"o": "1.1", "h": "1.1", "l": "1.1", "c": "1.1"},
        "volume": 0,
        "complete": False,
    }
    assert _to_row("GBP_USD", candle)["complete"] is False


# --- retry policy: transient errors retry, 4xx do not ----------------------

def _status_error(code: int) -> httpx.HTTPStatusError:
    req = httpx.Request("GET", "https://example.test/feed.json")
    resp = httpx.Response(code, request=req)
    return httpx.HTTPStatusError(f"{code}", request=req, response=resp)


def test_retry_predicate_skips_4xx():
    # a 404 (e.g. an unpublished calendar feed) must not be retried
    for predicate in (cal_is_retryable, oanda_is_retryable):
        assert predicate(_status_error(404)) is False
        assert predicate(_status_error(400)) is False
        assert predicate(_status_error(401)) is False


def test_retry_predicate_retries_5xx_and_transport():
    for predicate in (cal_is_retryable, oanda_is_retryable):
        assert predicate(_status_error(500)) is True
        assert predicate(_status_error(503)) is True
        assert predicate(httpx.ConnectError("boom")) is True


def test_retry_predicate_ignores_unrelated_exceptions():
    for predicate in (cal_is_retryable, oanda_is_retryable):
        assert predicate(ValueError("nope")) is False
