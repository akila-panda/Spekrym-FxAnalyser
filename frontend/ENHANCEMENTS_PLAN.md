# Spekrym-FX — Enhancements Plan (harvested ideas)

**Date:** 2026-10-07. Source: the good, in-scope ideas salvaged from the external spec pack
(`00–10_*.md` in Downloads) — **without** its frontend analytics/research re-platform, which
we rejected (conflicts with "backend emits, frontend draws"; duplicates the Python Judge).

Each item is additive and fits the current architecture. Phases are session-sized; one at a
time; done = typecheck + tests + build + (runtime where visible), then stop.

Legend: 🟩 pure/low-risk · 🟨 wiring/UI · 🟧 backend/data.

---

## Track R — research & strategy hardening (Python backend; independent of the UI work)

| Phase | Scope | Risk | Why | Verify |
|---|---|---|---|---|
| **E1** 🟧 | **Session calendar as data.** Versioned JSON per instrument (weekly open/close, daily roll 17:00 NY, holidays). Scanner + any session gating consult it; **fixes the H4/D-anchor debt** in the backend resampler. | med | Correct session anchors; clean gating; no hard-coded "London=08:00". | Fixtures: DST spring/fall, weekend gap, 17:00 NY roll. |
| ~~E2~~ | **ATR-unit strategy parameters — DROPPED.** Pip-based params work and are fine as-is; ATR conversion is a nice-to-have, not a need (YAGNI). Revisit only if cross-pair pip-tuning ever becomes a maintenance burden. | — | — | — |
| **E3** 🟩 | **Negative-control oracles in the research harness.** Tests that deliberately leak future data (e.g. `feat[t]=close[t+1]−close[t]`) and assert the Judge **fails** them; plus a positive control that passes. | low | Proves look-ahead guards actually work. | CI asserts harness fails both leaks, passes the clean one. |
| **E4** 🟩 | **`dataVersion` in the ledger.** Hash the dataset snapshot (content + instrument + TF + calendar version, excluding query range) and record it per experiment. | low | Reproducibility: know exactly which data a result used. | Backfill/correction bumps the hash; same data different range does not. |
| **E5** 🟩 | **Developing-vs-Confirmed discipline** *(only when the backend emits swing/structure annotations).* Confirmed only after N bars; `known_at` = confirming bar; developing drawn faint. | low | Keeps structure annotations causal. | Contract stub now; build with the first structure emitter. **[DEFERRED]** |

## Track X — frontend diagnostics (fits the contract; uses data we already emit)

| Phase | Scope | Risk | Why | Verify |
|---|---|---|---|---|
| **E6** 🟨 | **"Explain this setup" panel.** Render the provenance chain from a setup's existing `conditions` + `steps` + `known_at` (e.g. *Equal High → Sweep >1.2 ATR → Displacement → H1 BOS, known 09:55*). Pure view; no new backend. | low | Turns the honesty data we already carry into a readable story. | Select a setup → ordered, timestamped chain renders; 0 console errors. |
| **E7** 🟨 | **Surface "variants tried".** Show the FDR variant count (already computed in the Judge) next to exploratory results; needs the scan/research payload to carry it. | low | Makes multiple-testing honesty visible. | Count shows next to summary; absent → hidden gracefully. |
| **E8** 🟨 | **Excursion + range-consumption diagnostics.** Per-setup MFE/MAE in R (we compute MFE/MAE); range-consumption as a **labelled estimate**, never a "candle is done" prediction. | med | Richer, honest post-trade read. | Values match engine; caveat label present. |

---

## Notes
- Track R is **pure backend/Python**; it can run in any gap and never blocks the UI tracks.
- Track X is **pure frontend** over the existing scan contract; E6 needs no backend change.
- E7 is the only cross-cutting one (needs the research/scan payload to expose the variant count).
- E5 stays a contract stub until there is a structure emitter to attach it to.
- Explicitly **out of scope** (recorded so it isn't silently revived): the external pack's
  C0/C1/C2 causal-object core, TS analytical engines (V1/SW1/SE1/MS1…), Feature Store, and TS
  research layer. Analytics/research stay in Python; the frontend consumes, not re-implements.
