# Spekrym-FX — Strategy Tooling Build Plan (recommended)

**Author:** Claude · **Date:** 2026-10-06
**Basis:** reconciles `SPEKRYM_STRATEGY_TOOLING_RESEARCH.md` and
`SPEKRYM_INDICATOR_REFERENCE_LIBRARY.md` (research) against the **actual** current contract and code.
**Locked decision:** indicator reference = **TA-Lib / pandas-ta** (Wilder RMA with SMA seed,
population std-dev; golden fixtures asserted within a stated tolerance — exact equality is wrong).

---

## 0. Corrected starting position (research docs were stale)

Research assumed "Phase 7 partial / Phase 8 stray dir." Actual state:

- Frontend Phases **0–11 done and runtime-verified**; Phase 12 (polish) paused; **Phase 13 (real API) not done**.
- Contract today — kinds: `level, zone, window, line, polyline, marker, trade, text`;
  StrategyDef: `id, name, description, params, supported_timeframes, context_timeframes, display_tz`.
- Missing everything the new tooling needs: `signal_class`, `indicators_used`, `requires_data`,
  `dash/extend/state`, and `series/band/pane/banded-zone/fib/bar-highlight`; `polyline` exists
  but lacks ratios/labels/`complete`.

This plan slots **after Phase 11**, interleaving the research Phases 14–20 with the open Phase 13.

---

## 1. Recommended sequence (and why)

Principle: **ship the pure, low-risk, frontend-only work first** (independent of real indicator
math — keeps momentum), **then** the backend-heavy indicator accuracy work. Data backfill runs in
the background throughout.

| Order | Phase | Scope | Risk | Depends on |
|---|---|---|---|---|
| 1 | **14 — Contract v2** | Zod schemas + types for `signal_class`, `indicators_used[]`, `requires_data[]`, `dash/extend/state/mitigated_at`, and new primitive schemas (`series, band, pane, banded_zone, fib_zone, bar_highlight`, pattern-polyline `ratios/complete`). **Add `plot_time` vs `known_at`** (Ichimoku shift). Backend catalog tagging. **No rendering yet.** | Low (pure) | — |
| 2 | **15 — Price-only tools A** | Renderers: swing `marker`+`text`, BOS/CHoCH `line`+dash, banded zone (premium/discount), ray `state` (untested/touched/mitigated), bar highlight. Mock emitters drive them. | Low–med | 14 |
| 3 | **16 — Price-only tools B** | Fib zone, pattern polyline (classical + harmonic) with ratio labels + `complete` gating across steps, phase box (Wyckoff/PO3). | Med (geometry) | 14, 15 |
| 4 | **17 — Strategy filter** | 3-way `signal_class` filter + indicator chips in the picker (already strategy-agnostic → small). Chips filterable by indicator (e.g. "uses ATR"). | Low | 14 |
| 5 | **13 — Real API** | Swap mock→real backend; run on ingested pairs. Reconcile the ORB scanner's **mid-price + fixed 1.6-pip cost** with the research `scalp_engine` bid/ask model. | Med–high (backend) | data backfill |
| 6 | **H4 anchor fix** | Native H4 (17:00 NY) or configurable resample anchor. **Before Phase 18** — correctness blocker for H4 indicators. | Med (data) | — |
| 7 | **18 — Panes + series** | lightweight-charts v5 panes (Workbench has **no sub-pane area today** — real layout work), `series` (MA/RSI/MACD/ATR/ADX), legend `params_used`, HTF step lines. Backend computes all values (TA-Lib). | High | 13, H4 fix |
| 8 | **19 — Bands + accuracy** | `band` (Bollinger/Keltner/Donchian), divergence links, **golden-fixture accuracy tests** vs TA-Lib within tolerance. | High | 18 |
| 9 | **20 — Edit/reset layer** | Drag/resize strategy-emitted objects, per-id overrides, "what-if R" (clearly not the strategy's result), parameter editing → re-request. | Med | 18 |

**Fastest path to visible value:** 14 → 15 → 16 deliver most of the ICT/SMC/price-action tooling
(the project's stated edge lane) with **no** backend indicator math.

---

## 2. Scope recommendations (parked/ambiguous items)

| Item | Recommendation | Rationale |
|---|---|---|
| **OTE / Fibonacci = `price_only`** | ✅ **Adopt** | Fib is price-derived, not an indicator. Revisit only under a strict "no calculated overlays" rule. |
| **Fix H4 anchor (17:00 NY)** | ✅ **Adopt — before Phase 18** | H4 candles + indicators won't match broker/TradingView until anchored. Correctness, not polish. |
| **Hybrid chips filterable by indicator** | ✅ **Adopt (cheap)** | `indicators_used[]` already in Phase 14; filter is a small Phase-17 add. |
| **News / macro calendar feed** | 🟡 **Defer; optional slice after 17** | Reaction setups (CPI/NFP/FOMC → `window`+`marker`) are valuable and cheap once primitives exist, but add an external dependency. Not critical path. |
| **Tick-volume source (OANDA)** | 🟥 **Do not add now** | Spot FX has no centralized volume; tick volume is non-authoritative. Volume-profile/order-flow stay parked until a volume-dependent strategy is actually prioritized. |

---

## 3. Indicator reference (locked) — from the reference library

- **Reference tier:** Tier-1 original authors for definitions (Wilder 1978, Bollinger, Keltner/Raschke,
  Hosoda); **Tier-2 TA-Lib / pandas-ta to match numbers**; TradingView Pine only as a secondary cross-check.
- **Wilder smoothing** (α = 1/N, SMA seed) underlies RSI/ATR/ADX — same recursion as RMA / SMMA /
  "Wilder's average". A 14-period RMA ≈ a 27-period EMA.
- **Bollinger** default 20 / 2σ, **population** std-dev (TA-Lib); middle-band type must match the std-dev type.
- **Keltner is ambiguous** (1960 SMA original vs 20-EMA ± 2×ATR(10)) — pick one and **name it in the
  legend** (`KC(20, 2.0, ATR10)`).
- **Ichimoku** plots the cloud 26 bars forward and Chikou 26 back → contract must carry **`plot_time`
  separate from `known_at`** (added in Phase 14).
- **Honesty:** FX adaptive-markets evidence (Neely/Weller/Ulrich) shows classic MA/filter rules lost
  their edge by the early 1990s → keep the **exploratory badge + net-of-cost expectancy** on indicator-class strategies.

---

## 4. Cross-cutting rules (locked by this plan)

1. **Backend emits, frontend draws** — the UI never recalculates an indicator value.
2. **Causality** — `known_at` = confirmation bar (swings/BOS print after N confirming bars);
   patterns carry `complete: bool` and must not render as finished at earlier steps; ray state
   changes and dealing-range re-anchors are **separate steps / annotations**; `plot_time ≠ known_at`.
3. **Indicator accuracy (TA-Lib)** — warm-up bars `null` (never `0`); backend fetches lookback before
   the visible window; `params_used` shown in the legend; golden fixtures within a stated tolerance.
4. **Edit layer** — strategy stats always come from the backend; a dragged entry/stop is a labelled
   "what-if R", never the strategy's result. Indicators are not draggable (edit params → re-request).
5. **Verify against installed typings** — read `node_modules/lightweight-charts/dist/typings.d.ts`
   for pane APIs before Phase 18, not the online docs.

---

## 5. Open items to decide later

- Divergence rendering (linked lines across price + pane) — design in Phase 19.
- Whether macro/news becomes its own phase or rides inside a price-only release.
- Exact per-indicator tolerance for golden fixtures (set when Phase 19 fixtures are written).
- Obtain Wilder / Appel / Lane originals (or reputable excerpts) to verify MACD/Stochastic/Donchian defaults.
