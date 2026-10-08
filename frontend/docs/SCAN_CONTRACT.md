# Scan contract

What the backend (`api/`) returns and the frontend (`src/types/schemas.ts`) validates. Fixtures in `src/test/fixtures/` are real backend output.

## Conventions

- Timestamps are strings like `2025-05-07 17:00:00+00:00` (UTC). The frontend converts them to UTC seconds in `lib/time.ts` only. Naive strings are read as UTC.
- Field names are kept as sent (snake_case). Only `Candle` is renamed: `t,o,h,l,c,v` becomes `time,open,high,low,close,volume`.
- Backend `null` for an unset field becomes an absent key.
- Pairs: `EUR_USD GBP_USD USD_JPY AUD_USD USD_CAD`. Timeframes: `M1 M5 M15 H1 H4`.
- Detectors never send bar indices. Everything is keyed by time.

## Endpoints

| Endpoint | Request | Response |
|---|---|---|
| `GET /api/strategies` | none | `StrategyDef[]` |
| `POST /api/scan` | `ScanRequest` | `ScanResult` |
| `GET /api/candles` | `pair, tf, from?, to?, before?, limit?` (max 20000) | `{pair, tf, candles[]}` ascending |
| `GET /api/bounds` | `pair` | `{pair, bounds: {M1..H4: {first, last}}}` (`null` when no data) |

Errors: `404` unknown strategy, `422` unsupported timeframe, bad params, bad range, or unknown pair. Body is `{"detail": "..."}`.

## StrategyDef

`id, name, description, supported_timeframes, context_timeframes, display_tz, params[]`.

`ParamDef` by `type`:

| type | extra fields |
|---|---|
| `number`, `integer` | `default, min?, max?, step?` |
| `boolean` | `default` |
| `select` | `default` (must be in `options`), `options[]` |
| `time` | `default` as `HH:MM` |

All params also carry `key, label, unit?, help?`. The form is generated from this; the frontend knows no strategy.

## ScanRequest

```json
{"strategy_id":"orb","pair":"EUR_USD","timeframe":"M1",
 "from":"2025-05-06","to":"2025-05-07","params":{"use_vwap":true}}
```

`from`/`to` are inclusive UTC dates or datetimes. Omitted params use defaults. Unknown params are rejected.

## ScanResult

`scan_id, timeframe, strategy, params_used, setups[], summary, warnings[]`

**Setup:** `id, status (valid|rejected), direction?, date, focus {from,to}, steps[], conditions[], annotations[], outcome?`

- `valid` requires `outcome`. `rejected` has none.
- `steps[]`: `{n, label, known_at}`. The scrubber replays these in order.
- `conditions[]`: `{key, label, passed: true|false|null, detail}`. `null` means not applicable.
- `outcome`: `result (win|loss|flat), r_multiple, net_pips, cost_pips, exit_reason, bars_held`. R is net of cost.
- Checked on parse: annotation `step` is `0` or a listed step, annotation ids unique, `focus.to > focus.from`.

**Summary:** `n_valid, n_rejected, n_wins, n_losses, win_rate, expectancy_r, avg_win_r, avg_loss_r` (all `null` when no valid setups), `cost_pips_assumed`.

**Warnings** always include the in-sample notice. Fewer than 30 valid setups adds a "too few" warning. The UI shows both.

## Annotations

Common: `id, kind, role, tone (bull|bear|neutral|info), source_tf, step, known_at, label?, why?, emphasis (faint|normal|strong), flow? (down|local|all), visible_on?`

- `step: 0` is context, always shown. `known_at` drives the Steps scrubber (causality).
- `role` is any string. Unknown roles are drawn by `tone`. Colours come from the frontend tokens, never the backend.
- Known roles: `bias range window liquidity sweep structure imbalance order_block premium_discount entry stop target filter context`.

| kind | geometry |
|---|---|
| `level` | `t0, t1?, price` |
| `zone` | `t0, t1, p_high, p_low` |
| `window` | `t0, t1` (full-height band) |
| `line` | `points[]` (2+), each `{t, p}` |
| `polyline` | `points[]` (2+) |
| `marker` | `t0, price, shape (arrow_up|arrow_down|circle)` |
| `trade` | `t0, t1, direction, entry, stop, target, exit_time?, exit_price?` |
| `text` | `t0, price, label` |

A missing required geometry field fails the parse with its path, for example `scan: setups[0].annotations[2].p_high: Expected number, received null`.

### Routing: which chart shows an annotation

1. Always on the chart where timeframe equals `source_tf`.
2. Context flows down: zones, levels, windows and lines from a higher timeframe also show on lower charts.
3. Detail stays local: markers and text from a lower timeframe do not show on higher charts.
4. Trades show everywhere.
5. `flow` or `visible_on` override per annotation.
6. Annotations under about 3 px wide at the current zoom are hidden unless `emphasis` is `strong`.

## Trade timing

Entry is at the breakout bar's close, so `t0 = known_at = bar open + bar length`. The exit of an intrabar stop or target is `bar open + bar length` of the bar that hit it, so `exit_time > t0` always.

## Example (valid ORB setup, trimmed)

```json
{"id":"orb-2025-05-07-M1","status":"valid","direction":"long","date":"2025-05-07",
 "focus":{"from":"2025-05-07 07:11:00+00:00","to":"2025-05-07 07:25:00+00:00"},
 "steps":[{"n":1,"label":"Range forms","known_at":"2025-05-07 07:15:00+00:00"},
          {"n":4,"label":"Entry","known_at":"2025-05-07 07:16:00+00:00"}],
 "annotations":[
  {"id":"orb-2025-05-07-M1:range","kind":"zone","role":"range","tone":"neutral","source_tf":"M1",
   "step":1,"known_at":"2025-05-07 07:15:00+00:00","t0":"2025-05-07 07:00:00+00:00",
   "t1":"2025-05-07 07:15:00+00:00","p_high":1.101,"p_low":1.1,"label":"Range 10.0p"},
  {"id":"orb-2025-05-07-M1:trade","kind":"trade","role":"entry","tone":"bull","source_tf":"M1",
   "step":4,"known_at":"2025-05-07 07:16:00+00:00","t0":"2025-05-07 07:16:00+00:00",
   "t1":"2025-05-07 07:17:00+00:00","direction":"long","entry":1.1012,"stop":1.1002,
   "target":1.1027,"exit_price":1.1027,"label":"+1.34R","emphasis":"strong","flow":"all"}],
 "outcome":{"result":"win","r_multiple":1.34,"net_pips":13.4,"cost_pips":1.6,
            "exit_reason":"tp","bars_held":1}}
```

## Adding a strategy

Backend only, no frontend change:

1. Create `api/strategies/<name>.py` with `info: StrategyDef` (params, `supported_timeframes`, `display_tz`), `cost_pips`, and `scan(pair, tf, df, start, end, params) -> list[Setup]`.
2. Register it in `api/strategies/registry.py`.
3. Emit annotations using the kinds and roles above, with a `step` per stage and `known_at` for when each became knowable.
4. Add a test with crafted candles and a known outcome (see `api/tests/test_api.py`).

Parameter forms, supported-timeframe states, and the picture come from this data.