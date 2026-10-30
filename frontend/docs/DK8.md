# DK8 — FVG (done)

Progress: DK0 ✔ … DK8 ✔ → next DK9 (liquidity pools & sweeps). Gate G1 (use DK7 export on a real day) still open.

Deviations:
- Gap = 3 bars (bar1 vs bar3), size ≥ `fvg.minAtr` × ATR at bar 3 (causal). `known_at` = bar 3 close; `t_event` = middle bar; id anchor = middle bar time (price excluded).
- Lifecycle (append-only, each `known_at` = close of its bar): `open` → `partially_filled` (first wick into the gap, `detail.depth` 0–1) → `filled` (rule `wick`: wick reaches far edge; `close`: close reaches it) → `invalidated` (close beyond far edge) → `inverted` (later retest from beyond the far edge that closes back beyond it; terminal). Filled / invalidated / inverted are separate facts; filled+invalidated can share a bar.
- CE (midpoint) is a `geometry.points[0]` + a `ce` grade factor (shown in the evidence drawer). The adapter does not draw a CE line yet (chart phase).
- `origin_id` = displacement covering the middle bar, only if that displacement had already ended by the FVG's `known_at` (no future-dependent link).
- Heuristic significance = TF weight × min(1, gapATR / `fvg.fullSizeAtr`). New defaults `fvg.fullSizeAtr = 1.0`, `fvg.nearestN = 5` (rulesVersion changes).
- `nearestFvgs(objects, price, n)` (active gaps nearest price) is exported from `detect`; not yet wired into `selectForView` (existing relevance filter + caps stay the only limits) — wire with the chart phase.
- Overlap/nested relations come from the existing `buildRelations` (HTF gap containing an LTF gap = `nested`); no new relation code.
- Harness: prefix-equality on all 5 fixtures, a lifecycle walk and deep H1 for both fill rules. 5,000 M15 bars: 766 gaps, 21.5 ms (detector only).