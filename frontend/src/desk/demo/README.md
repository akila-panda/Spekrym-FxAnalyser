# Demo mode (REMOVABLE)

A throwaway, self-contained demo so the product can be experienced on simulated data before any backend exists. **Delete all of this when the real backend/data lands.**

## What it is
- `?window=demo` → `DemoRoot`: a real lightweight-charts chart (`DemoChart`) with mock candles (`demoCandles`) and sample objects (`demoObjects`) drawn via the production chart + annotation path, plus links to every feature surface (Canvas, journal, analytics, workbench, brain, portfolio, ops).
- 100% mock, deterministic, labelled "sample". It reuses production code read-only and adds no new contracts.

## How to activate / view
- **Easiest:** click the floating **"◉ Demo on/off"** toggle (bottom-right, on every surface). It persists in `localStorage` (`spekrym.demo.v1`) and reloads.
- Or append **`?demo=1`** (`?demo=0` to turn off) to any URL.
- With demo on, the DESK stage (Analysis / MY DESK Live / MY DESK Review) shows a real chart driven by the Desk detectors + Layers panel. `?window=demo` is a standalone demo surface with a chart + links to every surface.

## Removal
1. Delete `frontend/src/desk/demo/` and `frontend/src/styles/demo.css`.
2. `frontend/src/App.tsx`: remove the `DemoToggle` import + `<DemoToggle />`.
3. `frontend/src/window/role.ts`: remove `| { kind: "demo" }` and `"demo"` from `SIMPLE`.
4. `frontend/src/window/WindowRoot.tsx`: remove the `DemoRoot` import and the `role.kind === "demo"` line.
5. `frontend/src/desk/workspace/DeskRoot.tsx`: remove the two `// DEMO` imports and the `isDemo()` block in `Stage`.
6. (optional) clear the `spekrym.demo.v1` localStorage key. Nothing else depends on the demo.

## Chart-backed Prepare and intelligence (23 October 2026)

See `frontend/docs/DEMO_CHART_WALKTHROUGH.md` for controls, visual capabilities, sample-data boundaries and verification.

Prepare now renders its actual detector candles/candidates. Canvas uses `intelligenceFixtures.ts` for a consistent synthetic chart/panel/timeline dataset, rendered by `intelligenceChartModel.ts` and `CanvasDemoChart.tsx`. The original uncalibrated forecast stays withheld; a separately labelled synthetic envelope illustrates the calibrated display contract.

Removal also requires removing the demo imports/branches from `PrepareWidgets.tsx` and `CanvasRoot.tsx`. The fractional-coordinate fix in `annotations/primitives/coords.ts` is a general chart correctness fix and can remain.