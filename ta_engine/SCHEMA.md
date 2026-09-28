# Technical Facts JSON Schema

Returned by `ta_engine.facts.get_technical_facts(pair, timeframe)`.

```json
{
  "pair": "EUR_USD",
  "timeframe": "H1",
  "generated_at": "2026-09-22T10:00:00+00:00",
  "candle_count": 500,
  "last_close": 1.0921,
  "last_ts": "2026-09-22 09:00:00+00:00",
  "indicators": {
    "ma": { "sma20": 1.091, "sma50": 1.089, "sma200": 1.082, "ema20": 1.0915 },
    "rsi14": 58.3,
    "macd": { "macd": 0.0012, "signal": 0.0009, "hist": 0.0003 },
    "atr14": 0.0034,
    "bollinger": { "upper": 1.095, "mid": 1.091, "lower": 1.087 }
  },
  "price_action": [
    { "pattern": "bullish_engulfing", "ts": "2026-09-22 08:00:00+00:00", "index": 18 }
  ],
  "support_resistance": {
    "resistance": [ { "level": 1.0980, "touches": 3 } ],
    "support": [ { "level": 1.0850, "touches": 2 } ]
  },
  "smc": {
    "break_of_structure": [
      { "type": "bullish_bos", "ts": "...", "index": 42, "broken_level": 1.0940 }
    ],
    "order_blocks": [
      { "type": "bullish_ob", "ts": "...", "index": 39, "high": 1.0912, "low": 1.0898, "bos_index": 42 }
    ]
  }
}
```

## Notes
- `timeframe` ∈ `{H1, H4, D1}`; H4/D1 are resampled from stored H1 candles.
- `price_action.pattern` ∈ `{bullish_engulfing, bearish_engulfing, bullish_pin_bar, bearish_pin_bar, inside_bar}`.
- `indicators` fields are `null` if fewer than the required lookback candles are available (e.g. `sma200` needs 200 candles).
- On insufficient data (`candle_count < 50`), `indicators` returns `{"error": "insufficient_data", "candles_available": N}`.
- On no candles at all, top-level response is `{"pair", "timeframe", "generated_at", "error": "no_data"}`.