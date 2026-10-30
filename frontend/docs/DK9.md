# DK9 — Liquidity pools & sweeps (done)

Progress: DK0 ✔ … DK9 ✔ → next DK10 (supply & demand). Gate G1 (use DK7 export on a real day) still open.

Deviations:
- Pool = two equal internal-scale swing highs/lows within `liquidity.eqAtr` × ATR (ATR at the 2nd swing's confirmation bar), no bar between them trading through the level by more than the tolerance. `known_at` = 2nd swing's confirmation bar close. Band, direction and grade are frozen; a 3rd equal swing at the same level is absorbed (no duplicate pool). Direction: `bear` = equal highs (above price), `bull` = equal lows (below).
- Window = `lookbackDays` trading days (UTC dates that have bars), measured from the pool's first swing; runs on every TF. `liquidity.detectionTf` is carried but not yet used. An unswept pool gets `superseded` (reason `window`) when its window ends; no sweep is produced after that.
- Sweep = first bar trading ≥ `sweepAtr` × ATR beyond the pool edge: `wick_sweep` (closes back inside) or `close_beyond` (closes beyond). One sweep per pool. Sweep band = edge → extreme; marker at the extreme.
- Follow-through (window `followBars`, defaults 10) as independent lifecycle facts: `reaction_observed` (close departs ≥ `followAtr` × ATR back across the edge), `displacement_followed` (opposite-direction kernel displacement starting in the window, sweep only), `resolved` (window elapsed, `reacted` 0/1). Pool lifecycle: potential → swept → reaction_observed → resolved | superseded. Sweep lifecycle starts `observed`.
- New defaults `liquidity.followAtr` 1.5, `followBars` 10, `fullDepthAtr` 1.0 (rulesVersion changes). Heuristic significance: pool = TF weight × tightness; sweep = TF weight × min(1, depth ATR / `fullDepthAtr`).
- `liquidityName` drives labels ("Potential pool · equal highs", "Wick sweep · equal highs"). No new colours; the `✕ SWEEP` glyph is a chart-phase item.
- Harness: prefix-equality on all 5 fixtures, an extended sweep walk, deep H1 and deep M15. 5,000 bars: M15 0.8 ms, M1 4.1 ms (detector only).