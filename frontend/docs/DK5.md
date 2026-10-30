# DK5 — Respected S/R & reference levels (done)

Progress: DK0 ✔ DK1 ✔ DK2 ✔ DK3 ✔ DK4 ✔ DK5 ✔ → next DK6 (Prepare workflow & worksheet).

Deviations:
- sr_level objects exist only once respected (≥2 reactions; intraday ≥3) or a strong single (≥3 ATR within the reaction window); the `emerging` state is internal and never drawn. Band, direction and grade are frozen at establishment; later facts are lifecycle events (`tested`, `broken`, `role_reversed`).
- A reaction's band = swing extreme to bar-body edge, clamped to the band cap. Support breaks down, resistance breaks up; a role-reversed level breaks the other way. `done` after a second break.
- Reference levels: PDH/PDL/PDC from the D series, PWH/PWL from the W series; day/week open, completed session H/L (UTC hours, labelled "approx" until DK15) and round numbers (50-pip grid, known once first traded) from `reference.baseTf` (H1). Each level is `superseded` when its successor is known. H4/M-series emit none (no duplicates across TFs).
- New `reference` block in `methodology/defaults.ts` (changes `rulesVersion`).
- `role_reversed` maps to "touched" in the adapter; `levelName` drives labels (`Support ×3`, `PDH`).
- Significance is a heuristic (TF weight × touches); relevance stays a view-time filter.