# Spekrym-FX — Frontend Development Phases

**Purpose:** the build sheet for the full roadmap, **frontend-only**. Companion design doc:
`FRONTEND_DEV_DESIGN.md` (UI/UX, theme, component specs). Date: 2026-10-08.

**Scope rule:** this file builds the **frontend**. Backend/Python items in the roadmap
(E1 session calendar, E3 negative oracles, E4 dataVersion) are **out of this build** — the
frontend only *consumes* their output, so each is listed with the mock/contract the UI needs
and then skipped in the frontend stream.

**Per-phase definition of done:** typecheck ✅ · unit tests for new pure logic ✅ · full suite ✅ ·
`npm run build` ✅ · runtime check in a browser with **0 new console errors** ✅ · report only
files created/modified · then STOP (one phase per session).

**Baseline already in the repo** (do not rebuild): 5-panel workbench, strategy picker + params +
scan, setups list/detail/condition-checklist/step-scrubber, annotation primitives
(`level/zone/window/line/polyline/marker/trade/text` + v2 `series/band/bandfill/fib_zone/
banded_zone/bar_highlight`), chart linking + per-chart projection, scan analytics, what-if editor,
URL-state, presets, CSV/JSON export, strategy-class filter + indicator chips. These phases build
**on top** of that; with no `?window=` param and the stack layout off, existing behaviour is unchanged.

Order: `P0 → (E3,E4 backend) → W1 → W2 → W3a → W3b → S1 → S2 → S2.5 → S3 → E6 → S4 → S5 → S6 → W4 → W5 → (E1 backend) → W6 → W7 → S7 → Core12 → [Core13] → E7/E8/E5`

Legend: 🟩 pure/low-risk · 🟨 wiring/UI · 🟧 browser-API/perf · ⛔ backend (not in this build).

---

## Stage 0 — Prep

### P0 🟩 — Recon + state classification
- **Goal:** no code. Produce `docs/state-classification.md` classifying **every** field in
  `viewStore`, `panelStore`, `scanStore`, `annotationStore`, `overrides` as
  **global-shared / window-scoped / view-scoped / ephemeral**. Confirm TF types, primitive list,
  loader paths, preset/URL layers. Record mismatches in `docs/DEVIATIONS.md`.
- **Critical rule captured here:** `layout` is **window-scoped → never replicated** across windows.
- **Files:** `docs/state-classification.md`, `docs/DEVIATIONS.md`.
- **Done:** every store field classified; unclassified defaults to non-shared.

### E3, E4 ⛔ backend (skip in frontend build)
- E3 negative-control oracles, E4 `dataVersion` in ledger live in the Python research engine.
- **Frontend touchpoint:** none for E3. For E4, the scan payload *may later* carry `data_version`
  (string) — treat as optional display metadata; absent ⇒ hide.

---

## Stage 1 — Multi-window spine

### W1 🟩 — Window-role routing
- Parse `?window=` → `role`: `main` (default) · `charts` · `setups` · `chart:<tf>` · `stack` · (reserve `analytics`, `journal`).
- Render only that region; `main` unchanged. Role is read once at boot + on navigation.
- **Files:** `src/window/role.ts` (+ test), `src/window/WindowRoot.tsx`; wire in `App.tsx`.
- **Done:** `/?window=charts` shows only the grid; role-parser unit tests (valid/invalid/`chart:M5`).

### W2 🟩 — Sync protocol (pure, no wiring)
- `Envelope{protocolVersion, slice, revision, origin, payload}`; message types `hello/state/delta/cursor`.
- Per-slice **revision counters** (higher wins; tie-break by `origin`); mutation tags `LOCAL|REMOTE|DERIVED`; echo/remote guard; `debounce`; shape+version validation.
- **Files:** `src/sync/protocol.ts`, `src/sync/revision.ts`, `src/sync/debounce.ts` (+ tests). No store imports.
- **Done:** encode/decode, echo ignored, revision ordering, debounce tests.

### W3a 🟨 — Channel wrapper + viewStore
- `BroadcastChannel("spekrym")` layer; wrap `viewStore`; broadcast only `LOCAL`; apply remote under `applyingRemote`; `localStorage` `storage`-event fallback.
- **Files:** `src/sync/channel.ts`, `src/sync/bindStore.ts`, wire `viewStore`.
- **Done:** two tabs — change pair/tz/linked in one, mirrors in the other (Playwright two-page).

### W3b 🟨 — Remaining stores + presence
- Bind `scanStore`, `annotationStore`, overrides, (and the *shared* parts of `panelStore` only).
- **Snapshot-on-open:** new window `hello` → **Web Locks** leader answers `state`. **Scan lock** keyed `(pair,strategy,paramsHash,asOf)` so two windows don't double-run. **Heartbeat** presence (don't rely on `beforeunload`).
- **Files:** extend `channel.ts`/`bindStore.ts`, `src/sync/leader.ts`, `src/sync/presence.ts`.
- **Done:** strategy/scan/active-setup mirror; no duplicate scan; late-joining window syncs via snapshot.

---

## Stage 2 — MTF stack core

### S1 🟩 — Add D/W to the chart TF set
- Extend `Timeframe` to `W|D|H4|H1|M15|M5|M1`; ordering, `TF_SECONDS`, loader/resample paths, panel registration. Data already ingested.
- **Files:** `src/types/market.ts`, loader, panel config (+ tests for ordering/seconds).
- **Done:** D and W render in a panel; TF tests green.

### S2 🟩 — Alignment math (pure)
- Given `(tf, timeWindow)`: parent-candle **boundaries**, the **active parent span** for a time, and **child count** per parent — from **actual parent bars** (calendar fallback only). Half-open intervals; DST/weekend safe.
- **Files:** `src/stack/align.ts` (+ tests: H1⊃12×M5, DST spring/fall, weekend gap, forming parent).
- **Done:** fixtures green.

### S2.5 🟧 — lightweight-charts v5 spike
- Prototype + document: time↔coordinate, crosshair sync, missing-bar/nearest-bar snapping, `setCrosshairPosition` price requirement, multi-instance range sync, re-entrancy, replay/`asOf`.
- **Files:** `docs/spikes/S2.5-lwc-semantics.md` (findings), throwaway spike component.
- **Done:** findings doc written; S4–S6 build on it, not assumptions.

### S3 🟨 — Stack layout + Focus model
- New `stack` layout in `panelStore`: vertical **D·H4·H1·M15·M5·M1** column.
- Global **`Focus{anchor, interval, parentTF, drillDepth}`** + `DrillHistory`; per-TF **`ViewportPolicy`** (minContext/maxContext/focusCoverage) deriving each chart's `Viewport`. **Not** one shared `[from,to]`.
- Range-sync **loop guard** (`applyingRange` origin flag + debounce). Local pan/zoom sets `detached=true` + re-snap control.
- **Files:** `src/stack/focusStore.ts`, `src/stack/viewportPolicy.ts` (config), `src/panels/StackLayout.tsx`, panelStore `stack` mode.
- **Done:** all six follow the focus; detach + re-snap works; no ping-pong.

---

## Stage 2.5 — Opportunistic UX win

### E6 🟨 — "Explain this setup" panel
- Render the provenance chain from the active setup's existing `conditions` + `steps` + `known_at`
  as an ordered, timestamped story (e.g. *Equal High → Sweep → Displacement → H1 BOS · known 09:55*). Pure view; no backend change.
- **Files:** `src/components/setups/ExplainSetup.tsx` (+ test), wire into `SetupDetail`, `styles/explain.css`.
- **Done:** select a setup → chain renders in causal order with timestamps; 0 console errors.

---

## Stage 3 — MTF stack richness

### S4 🟨 — Parent brackets + shading + ×N
- On each lower chart draw verticals at higher-TF candle opens; **shade the active parent candle**; **`×N` badge** = children actually present (mark partial). Reuse `window`/`bandfill`/`level` primitives; cap to visible window.
- **Files:** `src/stack/brackets.ts`, `src/stack/StackBrackets.tsx` (+ tests), styles.
- **Done:** runtime screenshot; counts match actual children.

### S5 🟨 — Shared time crosshair
- Hover any chart → vertical on all six at the same time; nearest-bar snapping per chart; price for `setCrosshairPosition`; re-entrancy guard; uses the ephemeral `cursor` topic (also across windows).
- **Files:** `src/stack/useSharedCrosshair.ts` (+ test for snapping/guard).
- **Done:** hover one → line on all six.

### S6 🟨 — Click-to-drill
- Click a higher-TF candle → `Focus = [open, close)`, push `DrillHistory`; lower charts re-derive viewports. Breadcrumb + "back out" (pop, no recompute). One level at a time; jump composes intermediates. `KnownInterval(asOf)` clips forming parents (open/forming flag).
- **Files:** `src/stack/drill.ts` (+ tests), `src/stack/Breadcrumb.tsx`.
- **Done:** drill into an H1 → M5/M1 show that hour; back restores.

---

## Stage 4 — Multi-window completion

### W4 🟨 — Pop-out UX
- `⤢` on each panel header + each rail header; **Windows menu** (pop out charts/setups/stack, re-dock on close). Chrome-light popouts. Keyboard `P` pops out focused panel. Real buttons + aria-labels.
- **Files:** `src/window/PopoutButton.tsx`, `src/window/WindowsMenu.tsx`, dock/redock logic.
- **Done:** pop out → role window opens, live-synced; close re-docks.

### W5 🟨 — Cross-window crosshair/selection sync
- `cursor` topic across windows (debounced); selecting a setup in one drives all.
- **Files:** extend `useSharedCrosshair`, sync selection via channel.
- **Done:** hover/selection mirrors across windows.

---

## Stage 5 — Two-monitor placement

### W6 🟧 — Window Management API placement
- `getScreenDetails()` monitor map; place/fullscreen a role on a chosen screen; permission + feature-detect; fallback `window.open` with best-effort bounds. Handle popup-blocker, fullscreen-gesture, throttling, denied-permission.
- **Files:** `src/window/screens.ts`, `src/window/MonitorMap.tsx`.
- **Done:** "Charts → screen 2" works on 2 monitors; degrades cleanly without the API.

### W7 🟨 — Workspaces
- Save/restore `{role→screen, bounds, fullscreen}` as a **preset variant** + URL-encodable; popup-blocker "click to open next" fallback.
- **Files:** extend preset store, `src/window/workspaces.ts`, Workspaces UI.
- **Done:** save/restore a 2-monitor workspace.

---

## Stage 6 — Polish

### S7 🟧 — Stack polish
- Session-aware boundaries (uses `display_tz`; **E1 session calendar is backend** — until it exists, derive from candle opens), annotation flow-through into the stack, perf cap on drawn boundaries, a11y.
- **Done:** setups light up across the column; smooth at six charts.

### Core 12 🟨 — General UX polish
- Settings panel, empty/error/loading states audit, keyboard map, focus rings, reduced-motion, responsive down to a laptop screen.
- **Done:** audited states; a11y pass.

---

## Backend-gated / later (not in the frontend stream)
- **E1 ⛔** session calendar (Python) — frontend consumes correct session boundaries once it exists; until then S7 derives from candle opens.
- **Core 13** real API — frontend already supports `VITE_DATA_SOURCE=api`; flip when backend is ready (cost-model decision is backend).
- **E7 🟨** surface "variants tried" (needs the payload to carry the count; hide if absent).
- **E8 🟨** excursion (MFE/MAE in R) + range-consumption diagnostics (labelled estimate).
- **E5** developing-vs-confirmed — with the first structure emitter.

## Cross-cutting (every phase)
Additive & backwards-compatible · pure→wiring→chrome · invariants/tests named after their id ·
a11y (real buttons, aria-labels, `P` popout, `[`/`]` step) · perf (one chart per TF, cap boundaries,
debounce range/cursor) · state durability via presets + URL.
