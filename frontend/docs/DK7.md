# DK7 — TradingView export (done)

Progress: DK0 ✔ … DK7 ✔ → **Gate G1** (use on a real day; decide fixes) → next DK8 (FVG).

Deviations:
- Source is a saved Prepare snapshot (accepted + custom objects, as-of folded via `viewAsOf`); "active" = lifecycle not in `SPENT` (now exported from `prepare/walk.ts`). Spent objects are counted in the manifest, not drawn.
- Types drawn: box (banded sr_level/fvg/sd_zone/liquidity_pool/range), line (zero-height reference/custom levels), dashed line (trendline with ≥2 points). Trendlines without points are reported `unsupported`. No polylines or plots are used (meter shows 0/100, 0/64).
- Each object = 1 shape + 1 label (`[TF] headline`, shape/text cue; colour never alone). Drawn once inside `if barstate.islast`, `xloc.bar_time`, `extend.right`.
- Over limits: lowest significance dropped first, reported in header comment, manifest and a UI alert; the plain list always carries the full active set.
- Colours: hex copies of existing role tokens (`PINE_COLORS`); a test asserts each exists in `tokens.css`.
- OQ-4 default: FX roll kept; stated in the script header and UI. Times are absolute UTC.
- Sample stamp: indicator title `[SAMPLE]`, header comment, on-chart table cell.
- Output is deterministic (no clock). Strings escaped (`\`, `"`, control chars/newlines stripped, length-capped); notes/labels cannot inject Pine statements.
- No new store; export panel reads `usePrepareStore.view` + `useSnapshotStore`. Nothing in `sync/`; `viewStore.asOf` untouched.