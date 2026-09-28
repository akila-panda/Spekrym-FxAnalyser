import os
import time
import logging

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception

logger = logging.getLogger("oanda_client")


def _is_retryable(exc: Exception) -> bool:
    """Retry transient failures only: transport errors and 5xx responses.
    A 4xx (bad instrument, auth failure, etc.) will not succeed on retry."""
    if isinstance(exc, httpx.TransportError):
        return True
    if isinstance(exc, httpx.HTTPStatusError):
        return exc.response.status_code >= 500
    return False

ENV_HOSTS = {
    "practice": "https://api-fxpractice.oanda.com",
    "live": "https://api-fxtrade.oanda.com",
}


class CircuitBreaker:
    def __init__(self, fail_threshold: int = 5, cooldown_s: int = 60):
        self.fail_threshold = fail_threshold
        self.cooldown_s = cooldown_s
        self.failures = 0
        self.opened_at: float | None = None

    def allow(self) -> bool:
        if self.opened_at is None:
            return True
        if time.monotonic() - self.opened_at >= self.cooldown_s:
            self.opened_at = None
            self.failures = 0
            return True
        return False

    def record_success(self):
        self.failures = 0
        self.opened_at = None

    def record_failure(self):
        self.failures += 1
        if self.failures >= self.fail_threshold:
            self.opened_at = time.monotonic()
            logger.error("circuit breaker open for %ss", self.cooldown_s)


class CircuitOpenError(Exception):
    pass


class OandaClient:
    def __init__(self):
        token = os.environ["OANDA_API_TOKEN"]
        env = os.environ.get("OANDA_ENV", "practice")
        self.base_url = ENV_HOSTS[env]
        self.headers = {"Authorization": f"Bearer {token}"}
        self.breaker = CircuitBreaker()
        self._client = httpx.AsyncClient(base_url=self.base_url, headers=self.headers, timeout=15)

    @retry(
        reraise=True,
        stop=stop_after_attempt(4),
        wait=wait_exponential(multiplier=1, min=1, max=20),
        retry=retry_if_exception(_is_retryable),
    )
    async def _get(self, path: str, params: dict):
        if not self.breaker.allow():
            raise CircuitOpenError(f"circuit open, skipping {path}")
        try:
            resp = await self._client.get(path, params=params)
            resp.raise_for_status()
        except (httpx.TransportError, httpx.HTTPStatusError) as e:
            self.breaker.record_failure()
            raise
        self.breaker.record_success()
        return resp.json()

    async def get_candles(self, instrument: str, granularity: str = "H1",
                           count: int | None = None, from_time: str | None = None,
                           to_time: str | None = None, price: str = "M"):
        params = {"granularity": granularity, "price": price}
        if count:
            params["count"] = count
        if from_time:
            params["from"] = from_time
        if to_time:
            params["to"] = to_time
        data = await self._get(f"/v3/instruments/{instrument}/candles", params)
        return data["candles"]

    async def close(self):
        await self._client.aclose()