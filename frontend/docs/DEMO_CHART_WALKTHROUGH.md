# Prepare and intelligence chart demo

Updated 23 October 2026. Frontend demo implementation; no backend or model execution is added.

## Start

From `frontend/`, run `npm ci` once, then `npm run dev`. Click the floating **Demo on/off** control.

- Open **Desk → MY DESK → Prepare** for the chart-backed worksheet.
- Use **Open full intelligence demo** above its chart for the Intelligence Canvas, preserving the selected pair.
- In Canvas, click **Show all intelligence** to enter Explore with the object presets reset. Prepare, Monitor and Review also retain the chart.
- The standalone `?window=demo` surface now links to Prepare and enables demo mode in its surface links.

## DESK Prepare

The W → D → H4 → H1 → M15 → M5 → M1 rail switches both the worksheet and the chart. Candles are the exact `deepCandles` series used by the Prepare detectors, filtered to closed bars at the worksheet's as-of.

Selecting an inbox row or numbered chart candidate highlights its price geometry. **Focus candidate** locates its time/price extent; **Latest candles** returns to recent bars. Reference detector discriminator integers are excluded from the focus timestamps.

The existing layer settings and complexity filter the chart; the selected candidate stays visible for inspection. Accept, reject, revisit and custom decisions have explicit text/glyph labels. Rejected candidates are hidden unless selected or **Show rejected** is enabled. Existing custom-level creation, undo, notes, snapshot and export controls remain available below the chart.

The source mock generates each timeframe independently, as before. These are not aggregated cross-timeframe market data. The intelligence demo uses a separate, clearly labelled synthetic dataset; Prepare's detector levels are not reinterpreted as forecasts.

## How intelligence appears on candles

| Capability | Chart display | Interaction / boundary |
| --- | --- | --- |
| Observed objects | Support, range, supply zone, FVG, liquidity target, day open and structure | Shared with the composed object list; selection/query adds a focus glyph |
| Conditional scenarios | Dashed branch paths, trigger and target levels | Scenario Studio branch selection highlights the same branch; no scenario probabilities |
| Invalidation | Dashed labelled lower/upper boundaries | P0 stays visible when scenario paths are hidden or Simplify is on |
| Statistical forecast | Expanding interval with upper/lower/central lines | Explicit synthetic calibration example; not a real model result |
| Uncalibrated forecast | Context card with withholding explanation | The existing uncalibrated sample produces no envelope or probabilities |
| Regime | Time windows and labelled range/compression/transition states | Each state appears only after `available_at`; degraded data stays visible as P0 |
| Session intelligence | Asia, London and New York time windows | Illustrative fixed UTC windows, not a production DST calendar |
| Macro risk | Time-window shading and risk label | Active P0 risk cannot be hidden by normal layer controls |
| Trade evidence | Entry/exit labels and risk/reward geometry where the record supplies it | Executed, rejected, eligible, hypothetical and synthetic validated-tier records remain distinct |
| Master Brain | Context panel / cross-engine list | No price geometry is invented for a proposal without it |
| Replay | Candle cutoff and causal overlay reconstruction | Future events/exits and later scenario versions disappear; known projections may extend into empty future space |
| Visual query | Focused chart labels and matching engine cards | Queries select verified fixture records; they do not generate new geometry |

**Show all intelligence**, per-family checkboxes, **Simplify · P0 stays**, and **Reset chart view** are available above the Canvas chart. Feature cards locate geometry; cross-engine Locate controls highlight available chart evidence and identify context-only items.

The Canvas's existing six-step Prepare rail filters object overlays. Prediction and risk families have their own controls so their display can be explored independently. Monitor and Review retain their existing prototype change-feed/scorecard panels alongside the chart; these remain sample workflows, not a live execution simulation.

## Integrity and implementation notes

- Frozen fixture prices, IDs and instruments are mapped together for all five supported pairs. USD/JPY uses its correct price scale. Panels, timeline and chart share the same demo records.
- No observed future candles are fabricated. Forecast/scenario geometry may extend past as-of only when its issuing record is already available.
- Forecast-native series include hourly future points to preserve time-axis spacing. These are projections, not candle data.
- The installed lightweight-charts 5.2.1 rejects fractional logical indexes by returning zero. The coordinate adapter now interpolates integer coordinates, fixing intrabar events and projections without rounding their timestamps.
- Demo remains off by default. Explicit toggles remove a `demo=1` URL override before reloading, so the URL cannot silently turn it back on.
- Synthetic calibration fields exist only to exercise the calibrated-envelope UI contract. They are explicitly labelled and do not establish model reliability, strategy validation or expected returns.
- Other module capability gaps, including relative strength, volume/auction context and real forecast calibration, remain explicitly unavailable. This change does not implement those backend engines.

## Verification

- TypeScript typecheck: passed.
- Full Vitest suite: 150 files, 1,515 tests passed.
- New tests cover chart annotation output, forecast withholding, replay availability, instrument mapping, Prepare triage/layers, chart control wiring and fractional coordinates.
- Final focused tests were rerun after connecting Prepare's advanced layer settings.
- Production build: passed. Vite retains its bundle-size advisory for the main chunk (over 500 kB).
- Headless Chromium checks: Prepare timeframe switching, accept/undo, custom levels, Canvas Simplify, replay, Monitor/Review, USD/JPY and demo-off reload. No runtime errors. Light/dark chart layouts were visually inspected.

The archive retains all original entries, including data and backend files. Only the listed frontend source/documentation files were replaced or added; installed dependencies, temporary browser files and local build outputs were not added.

## Files added or modified

- `frontend/docs/DEMO_CHART_WALKTHROUGH.md`
- `frontend/docs/FRONTEND_PROGRESS.md`
- `frontend/src/annotations/primitives/coords.test.ts`
- `frontend/src/annotations/primitives/coords.ts`
- `frontend/src/desk/canvas/CanvasRoot.tsx`
- `frontend/src/desk/canvas/integration/EngineLayerPanel.tsx`
- `frontend/src/desk/canvas/query/QueryBar.tsx`
- `frontend/src/desk/canvas/scenario/ScenarioStudio.tsx`
- `frontend/src/desk/demo/AnnotatedChart.tsx`
- `frontend/src/desk/demo/CanvasDemoChart.tsx`
- `frontend/src/desk/demo/DemoRoot.tsx`
- `frontend/src/desk/demo/PrepareChart.tsx`
- `frontend/src/desk/demo/README.md`
- `frontend/src/desk/demo/chartDemo.test.ts`
- `frontend/src/desk/demo/chartDemoUI.test.tsx`
- `frontend/src/desk/demo/flag.ts`
- `frontend/src/desk/demo/intelligenceChartModel.ts`
- `frontend/src/desk/demo/intelligenceFixtures.ts`
- `frontend/src/desk/demo/prepareChartModel.ts`
- `frontend/src/desk/prepare/PrepareWidgets.tsx`
- `frontend/src/styles/demo.css`