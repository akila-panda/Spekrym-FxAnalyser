# Spekrym-FX — Multi-Window & MTF Stack: Phased Build Plan

**Companion to** `MULTIWINDOW_MTF_DESIGN.md`. Date: 2026-10-07.
**Rule:** each phase is one session-sized unit (small, self-verifying, ends green:
typecheck + tests + build + runtime). Do ONE phase, then stop. Pure logic first, wiring
after, chrome last — so a session never has to hold the whole feature at once.

Legend: 🟩 pure/low-risk · 🟨 wiring/UI · 🟧 browser-API/perf · ⬜ not started.

---

## Track A — Multi-window (W-phases)

| Phase | Scope | Risk | Deliverable / verify |
|---|---|---|---|
| **W1** 🟩 | **Window-role routing.** Read `?window=` → `role`; render the matching subset (`main`/`charts`/`setups`/`chart:<tf>`). No sync yet. | low | Opening `/?window=charts` shows only the grid. Unit test the role parser. |
| **W2** 🟩 | **Sync protocol (pure).** Message types (`hello/state/delta/cursor`), `senderId`, last-writer-wins + echo-guard, debounce helpers. No store wiring. | low | Pure tests: encode/decode, echo ignored, debounce. |
| **W3** 🟨 | **BroadcastChannel sync layer** wrapping `viewStore` + `scanStore` + `annotationStore` + `panelStore`; snapshot-on-open; feature-detect + `localStorage` fallback. | med | Two tabs: change pair/strategy in one → mirrors in the other (runtime). |
| **W4** 🟨 | **Pop-out UX.** `⤢` on panel headers + rail headers; Windows menu (pop out charts/setups, re-dock on close). | med | Click pop out → new window with that role, live-synced. |
| **W5** 🟨 | **Cross-window crosshair/selection sync** on the `cursor` topic (debounced); selecting a setup in one window drives all. | med | Hover/selection mirrors across windows. |
| **W6** 🟧 | **Window Management API placement.** `getScreenDetails()` monitor map; place/fullscreen a role on a chosen screen; permission + fallback. | high | On a 2-monitor machine, "Charts → screen 2" places correctly; degrades cleanly without the API. |
| **W7** 🟨 | **Workspaces** = saved `{role→screen,bounds}` via the preset store + URL; restore reopens the layout. | med | Save/restore a 2-monitor workspace. |

## Track B — Time-aligned MTF stack (S-phases)

| Phase | Scope | Risk | Deliverable / verify |
|---|---|---|---|
| **S1** 🟩 | **Add D/W to the chart TF set** (data already ingested); extend TF types, ordering, loader paths. | low | D/W render in a panel; tests for TF ordering/seconds. |
| **S2** 🟩 | **Alignment math (pure).** Given a TF and a time window, compute parent-candle boundaries + the active parent span + child-count per parent. | low | Pure tests (e.g. one H1 spans 12×M5; boundary times correct across DST). |
| **S3** 🟨 | **Stack layout** (`stack` layout in `panelStore`): vertical column D→M1, shared wall-clock `[from,to]` range, range changes propagate to siblings (debounced). | med | All six scroll/zoom together on the same time window. |
| **S4** 🟨 | **Parent brackets + active-parent shading** on each lower chart (reuse `window`/`bandfill`/`level` primitives) + per-segment "×N" badge. | med | Boundaries + highlighted parent candle render; runtime screenshot. |
| **S5** 🟨 | **Shared time crosshair** down the column (one vertical on all six). | med | Hover one → line on all six at the same time. |
| **S6** 🟨 | **Click-to-drill** time navigation: click a higher-TF candle → lower charts zoom to its span; breadcrumb + back-out. | med | Drill into an H1 candle → M5/M1 show just that hour; restore works. |
| **S7** 🟧 | **Polish:** session-aware boundaries (`display_tz`), annotation flow-through into the stack, perf cap on drawn boundaries, a11y. | med | Setups light up across the column; smooth at 6 charts. |

---

## Sequencing & dependencies
- **Independent tracks.** A and B can interleave. B's `stack` becomes a window role once W1 lands, so do **W1 → W2 → W3** first (the sync spine), then pick up B.
- Suggested order: **W1, W2, W3** (spine) → **S1, S2, S3** (stack core) → **W4, W5** (popout + cursor) → **S4, S5, S6** (brackets/crosshair/drill) → **W6, W7** (monitor placement/workspaces) → **S7** (polish).
- Each phase: branch-safe, additive, backwards-compatible (default single-window behaviour unchanged when `?window=` is absent and stack layout is off).

## Definition of done (every phase)
typecheck ✅ · unit tests for new pure logic ✅ · full suite ✅ · build ✅ · runtime check in the browser pane (0 new console errors) ✅ · output only files created/modified, then WAIT.

## Risks / honest notes
- Window Management API is Chromium-only → W6 must degrade, not block (W1–W5 work everywhere).
- Pixel-exact MTF proportional alignment is out (index-based axis); the bracket+linked-range design is the chosen, achievable path.
- Cross-window scan traffic is state-only (results broadcast once by the runner) to avoid duplicate backend load — matters more after Phase 13 (real API).
