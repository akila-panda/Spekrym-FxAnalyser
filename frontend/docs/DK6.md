# DK6 — Prepare workflow & worksheet (done)

Progress: DK0 ✔ … DK5 ✔ DK6 ✔ → next DK7 (TradingView export, Gate G1).

Deviations:
- Stage is a worksheet (step rail, current candidate, custom level, notes, snapshot), not a chart: no Desk chart exists yet and DK6 does not list one. Inbox = native objects of the step TF (types sr_level, reference_level, fvg, liquidity_pool, sd_zone, trendline, range), as-of folded via `viewAsOf`, spent states excluded, best significance first, capped at the Advanced per-layer cap (20). "Quiet HTF projection" is deferred to the chart phase.
- Prepare reads `deepCandles` directly (DeskSource.getCandles is still a stub); data kind is always `sample`. Detection of all 7 steps runs on the main thread after first paint (skeleton first); the worker decision stays with DK21/DK2 measurements.
- One decision per (pair, date, objectId); a re-decision replaces it (undo restores). `decided_at` = wall-clock seconds of the user action.
- Custom levels are `reference_level` objects (zero-height band) built from the draft; label in `grade.factors[label]`, group in `provenance.detector = "custom:<group>"`, `known_at` = the as-of when created. They are recorded as a `custom` decision and count as accepted in snapshots.
- `SnapshotSchema` gained `revisitIds` and `reviewedSteps` (both default `[]`). Snapshot = accepted objects in full + rejected/revisit ids; immutable (deep-frozen, add-only, duplicate id refused); capped at 100 (oldest pruned on quota).
- Checklist: ticked by mark or by full triage of a non-empty step; an explicit tick/untick overrides auto. An empty step is never auto-ticked.
- Keys (Prepare only): `[ ]` step · `J K` inbox · `Y N R` triage · `U` undo; skipped while typing. `isTyping` exported from `useDeskKeys`.
- New stores: `spekrym.desk.decisions.v1`, `spekrym.desk.snapshots.v1`, `spekrym.desk.prepare.v1` (drafts). None bound in `sync/`; Desk's own as-of is used, `viewStore.asOf` is never written.