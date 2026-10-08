# Spekrym-FX Frontend — Research & Feature Brief

Self-contained brief for ideating more frontend features with an AI. It states
**what we're building, why, the exact architecture and data contract, current
status/progress, what's planned, and open questions.** Give this whole file to an
AI and ask for feature ideas; it has the vocabulary and the constraints so ideas
land in-scope and don't repeat what exists.

Companion docs in this repo: `frontend/FRONTEND_DEVELOPMENT.md` (the phased build
plan), `frontend/docs/SCAN_CONTRACT.md` (the backend↔frontend data contract),
`DEVELOPMENT_ROADMAP.md` / `SYSTEM_DOSSIER.md` (the research-engine side).

---

## 1. The product in one paragraph

A **technical-analysis workbench for trading strategies** — an analyst's desk, not
a live chart and not a manual drawing tool. The user picks a **pair**, a **date
range**, and a **strategy** (ORB today; Silver Bullet and more later), clicks
**Scan**, and the backend finds every place the strategy applied and returns
**annotations** (ranges, sessions/kill-zones, liquidity levels & sweeps, structure
breaks, fair-value gaps, entry/stop/target, outcome). The UI **plots the picture on
five synchronized charts at once — M1, M5, M15, H1, H4** — and lets the user read
it, step through how the setup formed (causally), and browse every setup with its
pass/fail conditions and R-outcome. **Long-term goal: evolve toward a live cockpit.**

### Why it exists (fit with the wider project)
The parent project is a falsification-first FX research system (a locked "Judge",
vault, ledger — see `SYSTEM_DOSSIER.md`). The frontend is the **human-in-the-loop
visual layer**: eyeball *why* a strategy fires or fails, across pairs and
timeframes, before/after the Judge rules on it. It enforces the same **honesty
rules** in the UI (every scan stamped "exploratory / not Judge-validated";
headline metric is expectancy-in-R net of cost, never win rate; causality shown).

### The key design idea: strategy-agnostic rendering
The frontend **knows nothing** about ORB or Silver Bullet. A strategy runs on the
**backend** (Python, reusing the research `market_context/` + `ta_engine/`
detectors) and returns **annotations** = plain data ("a zone from t0→t1, role
`imbalance`, tone `bull`, with this explanation, knowable at this time"). The UI
only draws annotations and lists setups. **Adding a strategy later = backend only,
no frontend change** — its parameter form, supported timeframes, and chart picture
all come from data.

---

## 2. Architecture & stack

```
Browser (React/Vite/TS)                    FastAPI  api/                 TimescaleDB
 ├ 5 ChartPanels (lightweight-charts v5)    ├ GET /api/strategies         candles
 ├ Annotation primitives + renderer   <───  ├ POST /api/scan   ───reads──►  (OHLC +
 ├ Zustand stores (view/panel/scan/…)  JSON ├ GET /api/candles              bid/ask)
 ├ Zod-validated contract                   ├ GET /api/bounds
 └ Mock OR api data source                  └ strategy registry (ORB…)
```

| Concern | Choice |
|---|---|
| Build | Vite + React 18 + TypeScript (strict, no `any`) |
| Charts | `lightweight-charts` v5 (Apache-2.0); annotations are custom **series primitives** drawn in bitmap space |
| State | Zustand |
| Validation | Zod (runtime-validates backend responses; TS types inferred from schemas) |
| Tests | Vitest + jsdom + Testing Library (~335 at Phase 6) |
| Styling | Plain CSS + variables (`styles/tokens.css`); dark "analyst desk" theme |
| Data source | swap **mock ↔ real API** via `VITE_DATA_SOURCE` (mock backend fully built) |
| Backend | FastAPI `api/` (strategies/scan/candles/bounds) over the same TimescaleDB |

**Explicit non-goals (deliberate):** live data/WebSocket, a manual drawing suite
(trendlines/fib/rectangles), client-side indicators, order placement/broker
connection. ("Drawing" here means **strategy-emitted annotations**, not manual
markup.)

---

## 3. Data contract (what the backend returns, the UI draws)

Full spec: `docs/SCAN_CONTRACT.md`. Summary:

**Endpoints:** `GET /strategies` (catalog + parameter schema the form is generated
from), `POST /scan` (`{strategy_id, pair, timeframe, from, to, params}` →
`ScanResult`), `GET /candles` (ascending window; `before`/`limit` for scroll-back),
`GET /bounds` (first/last candle per TF).

**ScanResult:** `scan_id, timeframe, strategy, params_used, setups[], summary
(n_valid, n_rejected, n_wins, n_losses, win_rate, expectancy_r, avg_win_r,
avg_loss_r, cost_pips_assumed), warnings[]`.

**Setup:** `id, status (valid|rejected), direction?, date, focus{from,to}, steps[],
conditions[], annotations[], outcome?`. `valid` requires an `outcome`
(`result win|loss|flat, r_multiple, net_pips, cost_pips, exit_reason, bars_held`);
`rejected` has failed conditions and no outcome.

**Annotation kinds:** `level, zone, window, line, polyline, marker, trade, text`.
Common fields: `id, kind, role, tone (bull|bear|neutral|info), source_tf, step,
known_at, label?, why?, emphasis (faint|normal|strong), flow?, visible_on?`.

**Two rules that define the whole experience:**
- **Causality:** every annotation carries `known_at` (when it became knowable) and
  a `step`. The **Steps scrubber** replays a setup in order so you see what was
  known at each moment — not just the hindsight picture.
- **"Context flows down":** an annotation shows on its own `source_tf` chart; zones/
  levels/windows/lines from a *higher* TF also show on *lower* charts (an H1 FVG
  appears on M15/M5/M1); markers/text stay local; trades show everywhere. Backend
  can override per-annotation (`flow`/`visible_on`); user can override per-chart.

**Honesty in the UI:** summary strip always shows "Exploratory scan — not validated
by the Judge"; headline = expectancy in R net of cost (cost in pips shown); <30
setups shows "too few to read into"; stats are **per-timeframe, never summed across
timeframes** (an M1 and M5 scan can be the same move).

---

## 4. Current status & progress (honest)

**Backend (`api/`, built, 8 tests):** `/strategies /scan /candles /bounds /health`,
a strategy registry, and the **ORB scanner** (`api/strategies/orb.py`) emitting
annotations/conditions/steps/rejected-days/outcomes. A Postgres candle source + an
in-memory test source.

**Frontend progress (per `FRONTEND_DEVELOPMENT.md` tracker):**

| Phase | State |
|---|---|
| 0 Tooling & workbench shell | ✅ done |
| 1 Contracts (types, Zod schemas, time/tz utils) | ✅ done |
| 2 Mock backend (multi-TF candles, strategies, scanner) | ✅ done |
| 3 One chart panel (candles, scroll-back, tz) | ✅ done |
| 4 Five-panel workbench (layouts, shared controls) | ✅ done |
| 5 Annotation primitives (level/zone/window/line/trade/text) | ✅ done |
| 6 Annotation renderer (roles, routing, legend, steps reveal) | ✅ done (~335 tests) |
| 7 Strategy picker + params + scan one/all | ✅ done (merged + runtime-verified 2026-10-06) |
| 8 Setup browser (list, pins, detail, summary) | ✅ done (merged + runtime-verified 2026-10-06) |
| 9 Chart linking & per-chart projection | ⬜ planned |
| 10 Review, presets, URL state, export | ⬜ planned |
| 11 Scan analytics (optional) | ⬜ planned |
| 12 UX polish, settings, performance | ⬜ planned |
| 13 Backend integration (swap mock→real API) | ⬜ planned |

**Known repo issue — ✅ RESOLVED 2026-10-06:** the stray dir was merged over
canonical `src` (124 files), the backup retired, and the gate re-run green
(typecheck ✅, build ✅, 752/754 tests — the 2 failures are pre-existing
`generateCandles` mock tests, not from the merge). History below for context.

The source previously existed in **two
trees** — canonical `frontend/src` (111 files, Phases 0–7 base) and a **stray
`frontend/frontend/src` (24 files)** created by running a scaffold from the wrong
directory. The stray is **not junk**: it holds **13 unique Phase-8 files**
(`components/setups/*`, `scan/selectors`, `annotations/setupPins`,
`hooks/useSetupNavigation`) plus **11 modified files** (`scanStore`, `scanRunner`,
`AnnotationManager`, `ChartPanel`, `PanelHeader`, `Workbench`, `RightRail`,
`SummaryStrip`, `usePanelAnnotations`, `styles/layout.css`). A naive delete would
lose Phase 8. **Fix = merge stray over canonical, delete stray, run the gate
(`npm install && typecheck && test && build`) to confirm nothing broke.** Untracked
in git. A built `frontend/dist/` exists from an earlier build.

**Backend gaps/deviations (decide before Phase 13):** ORB outcomes don't go through
the research `backtest/scalp_engine.py` (the scanner walks bars itself, mid-price,
fixed 1.6-pip cost) — reconcile with the Judge's bid/ask cost model; H4 is resampled
from H1 (00:00 UTC) rather than ingested natively (17:00 NY) so it won't match
broker/TradingView H4; `PgSource` untested vs a live DB; ORB missing the H1 bias +
prior-day levels; Silver Bullet + SMC annotations (sweeps/MSS/FVG/OB) not built yet.

---

## 5. What we're planning to build (near-term)

**Immediate:** reconcile the dir (merge+verify), then **finish Phase 7** (pick
strategy → edit params → **Scan** → chart paints) and **Phase 8** (setup browser:
list, pins, condition checklist, steps scrubber, outcome). This makes
strategy→chart mapping work end-to-end on the mock backend.

**Then the planned phases 9–13** (linking, review/presets/URL/export, analytics,
polish/settings/perf, real-API integration).

**Feature ideas on top (TradingView / NinjaTrader-inspired — see §6):**
1. **Global Bar-Replay** — play the whole chart forward; each annotation appears at
   its `known_at`. (Beyond the per-setup Steps scrubber; our causality metadata
   already supports it.)
2. **TradingView-grade Trade primitive** — R-shaded entry/stop/target, exit marker +
   reason, MFE/MAE excursion overlay, optional bar-coloring while in position.
3. **Trade-list ↔ 5-charts link** — click a trade/setup, all five charts jump to it.
4. **Scan analytics drawer** — cumulative-R curve + R-histogram + buckets, with the
   "slicing produces chance patterns" caution.
5. **Composite 5-chart snapshot** export (all five lenses + caption).
6. **Strategy source-of-truth unification** — `api/strategies/*` wraps the research
   `market_context/*` so the UI scans the *same* strategies we research (backend).

**Long-term (live cockpit):** live candle updates, "scan as of now", live annotation
of the *forming* setup, alerting — a later track after the review features are solid.

---

## 6. Inspiration synthesis (what to borrow, what to beat)

**TradingView** — *Bar Replay* (replay bar-by-bar, mark entries/exits), *Strategy
Tester* (equity curve, drawdown, performance summary, **List of Trades** that maps
to the chart), **TP/SL drawn on chart + bar-coloring by position side**, one-click
**Snapshot** export. ([backtesting guide](https://finestel.com/blog/how-to-backtest-on-tradingview/),
[bar replay](https://www.tradingview.com/chart/GBPUSD/tLCsqnqE-Backtesting-strategies-using-TradingView-s-replay-feature/))

**NinjaTrader 8** — *Strategy Analyzer* (bar-by-bar backtest + optimization, realistic
commission/slippage, PF/drawdown/Sharpe), a **Chart tab** that maps entries/exits on
price, *Market Replay* (tick-accurate replay), a **Draw class / custom DrawingTool**
(strategies draw their own objects), and an explicit **performance caution**:
drawing objects loop every render → must diff/declutter (we already do).
([NT backtesting](https://www.quantvps.com/blog/backtest-on-ninjatrader),
[draw objects](https://forum.ninjatrader.com/forum/ninjatrader-8/strategy-development/1197322-drawing-objects-from-the-strategy))

**Our differentiator:** both platforms are single-chart-centric. Ours is **five
synchronized timeframes with "context-flows-down" annotations + a causal Steps/
Bar-Replay** — purpose-built for ICT/SMC multi-timeframe strategy study. Don't
imitate a single chart; double down on the 5-lens causal picture.

---

## 7. Design principles (keep ideas consistent with these)

- **Analyst's desk:** charts are the product; everything else is quiet. Motion only
  answers a click. Visible keyboard focus; keyboard-driven (`J/K` setups, `S` scan,
  `1–5` focus, `M` maximize, `[`/`]` steps, `?` help).
- **Tokens, not hex:** dark palette in `styles/tokens.css` (`--bg #0c1420`,
  `--panel`, `--grid`, `--text/--muted`, `--up #2fb88a`/`--down #e0575f`,
  `--accent #d8bc7a` for focus/primary-Scan only — never inside a chart). Roles get
  `--role-*` vars; unknown roles fall back to `tone`. Colour-blind palette later.
- **Causality & honesty are features, not footnotes** (Steps/Bar-Replay, exploratory
  badge, expectancy-R-net-of-cost, per-TF stats).
- **Strategy-agnostic:** the UI never encodes a strategy's rules.
- **Time:** chart works in UTC seconds; backend timestamps (`2025-05-07 17:00:00+00:00`)
  converted in one place (`lib/time.ts`); strategies declare `display_tz`
  (DST-safe windows, e.g. Silver Bullet in New York time).

---

## 8. Open questions for feature research

1. **Manual drawing?** The plan excludes a manual drawing suite (strategy-agnostic).
   A live cockpit might want light manual markup (notes, a measured move). Keep
   excluded, or add a minimal reviewer's markup layer?
2. **How far toward "live"?** Live candles, "scan as of now", forming-setup
   annotation, alerts — which, and when (post Phase 12)?
3. **Replay depth:** per-setup Steps scrubber only, or a full timeline Bar-Replay
   across the whole scanned range?
4. **Trade richness:** how much of TV's trade viz (MFE/MAE, bar-coloring, partial
   exits) is worth it vs noise?
5. **Analytics vs overfitting:** how much slicing (weekday/hour/regime) before it
   becomes chance-pattern mining? (Honesty caution required.)
6. **Multi-pair:** today one pair at a time; is a cross-pair scan view (same
   strategy, many pairs) valuable for the cross-sectional research direction?
7. **Backend unification:** confirm `api/strategies/*` should wrap the research
   `market_context/*` (one source of truth) rather than reimplement.

## 9. Glossary
- **Setup:** one instance where a strategy applied (valid or rejected).
- **Annotation:** a drawable fact (level/zone/window/line/marker/trade/text) with a
  role, tone, `source_tf`, `step`, `known_at`.
- **Step / `known_at`:** the causal stage and the moment info became knowable;
  drives the Steps scrubber / Bar-Replay.
- **Routing ("context flows down"):** which charts show an annotation.
- **Kill zone:** a session time-window strategies trade in (e.g. London/NY opens).
- **ORB:** Opening-Range Breakout. **Silver Bullet:** a one-hour kill-zone ICT setup.
- **Expectancy-R:** mean R per trade, net of cost — the headline honesty metric.
