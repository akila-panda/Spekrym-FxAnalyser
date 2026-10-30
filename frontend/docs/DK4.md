# DK4 — Market structure (done)

Progress: DK0 ✔ DK1 ✔ DK2 ✔ DK3 ✔ DK4 ✔ → next DK5 (respected S/R & reference levels).

Deviations:
- Structure runs on the swing scale (N×3). Breaks while the trend is `transitioning` are marked broken silently (no event).
- After a CHoCH the trend is `transitioning` until a new swing is confirmed; `confirmed_at` = when labels confirm the new direction. A CHoCH that closes back beyond the prior extreme gets lifecycle `invalidated` (reason `failed_choch`).
- structure_event kind is encoded in the last id anchor (1 BOS · 2 CHoCH · 3 protected level); decode via `structureKind`.
- `DetectCtx.cfg` added (optional) so detectors read the methodology in force.
- Structure detector registers before the sample detector; shared swing ids de-dupe to the labelled swings.
- Trend per TF is exposed by `analyzeStructure(k).trend` (consumed by DK13); no widget yet.