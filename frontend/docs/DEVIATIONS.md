# Deviations (P0)

1. `Timeframe` = `M1|M5|M15|H1|H4` only; `W`/`D` absent (S1). `PANEL_ORDER` = H4,H1,M15,M5,M1. Mock `generateCandles` aggregates from M1 via `TIMEFRAMES` — D/W must extend this.
2. `Layout` = `grid|focus|maximized`; `stack` absent (S3). URL `LAYOUTS` whitelist in `urlState.ts` must be extended.
3. `bandfill` is a primitive (`BandFillPrimitive.ts`), not a schema annotation kind. Schema kinds: level, zone, window, line, polyline, banded_zone, fib_zone, bar_highlight, series, band, marker, trade, text.
4. Primitive files present: Level, Zone, Window, Line, Text, Trade, BandFill, Base. No separate Marker/Polyline/Series/Band/FibZone primitive files — verify how `toPrimitives.ts` maps them before S4.
5. `useUrlState` rewrites the whole query via `replaceState` from `encodeState`, dropping unknown params ⇒ `?window=` would be erased. W1 must preserve it.
6. `useUrlState` restores `layout` from URL (window-scoped; OK) — W3a must exclude `layout` from broadcast.
7. W3b "shared parts of `panelStore`" = none under this classification.
8. `docs/` has only `SCAN_CONTRACT.md`; phase/design docs live in `frontend/` root.

9. S1: D anchored 22:00 UTC, W anchored Sun 22:00 UTC (FX roll). H4 stays epoch-aligned, so the 20:00 H4 bar straddles the D boundary; S2 must use actual parent bars. D/W are chart-only (`chart:D`, `chart:W`); grid/focus layouts and keys 1-5 stay 5-panel. Scans do not run on D/W (idle). Item 1 resolved by S1.

10. S3: `Layout` now includes `stack` (resolves item 2; URL `LAYOUTS` extended). Stack is D,H4,H1,M15,M5,M1 under a 26px focus bar; W has no row. Focus is window-scoped (not replicated). Detach is triggered only by pointer/wheel/touch on the row (not by range events alone), so lwc init/data range writes never detach. `window=stack` now renders the stack (was reserved).

11. DESK DK0 (split a/b): DK0-a = contracts + libs + defaults (`src/desk/types/schemas.ts`, `src/desk/lib/{ids,hash,storage}.ts`, `src/desk/methodology/defaults.ts`); DK0-b = `desk/source/*` + `desk/workspace/widgetRegistry.ts`. Deviation from `DESK_ARCHITECTURE.md` §1: all DK0 zod schemas consolidated into one `types/schemas.ts` (matches the repo's existing single-schemas convention) instead of separate object/lifecycle/methodology/decision/snapshot files; types are re-exported from there. All Desk state is local (`spekrym.desk.*`), never bound in `sync/`.
12. DESK DK6: see `docs/DK6.md` (worksheet stage instead of chart; deep mock read directly; `SnapshotSchema` + `revisitIds`/`reviewedSteps`; custom levels as `reference_level`; one decision per object per day).

12. DESK DK6: see `docs/DK6.md` (worksheet stage instead of chart; deep mock read directly; `SnapshotSchema` + `revisitIds`/`reviewedSteps`; custom levels as `reference_level`; one decision per object per day).
