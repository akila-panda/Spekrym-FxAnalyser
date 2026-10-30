# DK3 — Analysis pipeline (done)

Progress: DK0 ✔ DK1 ✔ DK2 ✔ DK3 ✔ → next DK4 (market structure).

Deviations:
- `describe(obj, depth)` is exported as `describeObject` (avoids clashing with test-runner `describe`).
- `usePanelAnnotations` gained one optional trailing param `extra`; merged after trade overrides; same routing/legend rules.
- Pipeline hook `layers/useDeskAnnotations` is ready but no Desk chart consumes it yet (Stage is a placeholder until a later phase).
- Relations are built over the selected (visible) objects, not per-TF in the registry.
- Evidence depth: Minimal = headline; Standard = + why/supports/conflicts; Advanced = + timing/data quality/relations.
- Palette command + shortcuts-sheet entry for `E` deferred to DK21; `E` mirrors the header "Evidence" button.
- `deepMock` timing test is slow in constrained containers (5 s default timeout); unrelated to DK3.
- Sample detector: swing high → direction "bear", swing low → "bull".