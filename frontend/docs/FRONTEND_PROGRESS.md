Frontend progress
23 October 2026 — chart-backed demo follow-up
Completed the explicitly requested demo expansion: Prepare candlestick chart linked to inbox/triage/layers, intelligence geometry on Canvas in all modes, causal replay, demo instrument mapping, synthetic forecast envelope plus uncalibrated withholding, and the URL-override toggle fix.

Verification: typecheck and build passed; full suite 150 files / 1,515 tests passed; focused regression tests rerun after the final layer-settings wiring. Chromium interaction checks completed without runtime errors.

Detailed scope and limitations: [DEMO_CHART_WALKTHROUGH.md](./DEMO_CHART_WALKTHROUGH.md).

The supplied version of this progress file was empty. This entry records only this change; it does not infer completion of any other frontend or backend phase.
28 October 2026 — connected investor walkthrough
Added a dedicated demo workspace with nine connected chapters, three guided stories, a shared aggregated M1 tape, causal playback/review, evidence focus, chart-editable plans, cost-aware paper fills, risk blocks, alerts, forecast revisions, currency comparison/exposure, journal export and a scripted research/Ops sequence. The floating demo control links to it; the previous gallery remains available.

This session is window-local and in-memory. Existing standalone feature screens retain their fixtures; no backend, broker, model training, real validation or cross-window synchronization is introduced. Details and presentation script: [INVESTOR_DEMO.md](./INVESTOR_DEMO.md).

Verification: typecheck and production build passed; 152 test files / 1,530 tests passed. Chromium checks passed for drag editing, drill/back, replay, story outcomes, stale-feed withholding, JPY, playback, mobile overflow and demo-off behavior, with no runtime errors. Vite retains its existing large-bundle advisory.