# Spekrym-FX — Multi-Window & Time-Aligned MTF Stack (Design)

**Author:** Claude · **Date:** 2026-10-07 · Status: design (pre-build)
**Goal:** production-grade, advanced-but-friendly. Two features:
A. Detach panels into their own windows for a multi-monitor desk.
B. A vertical, time-aligned multi-timeframe stack (D→M1) showing children inside a parent candle.

Grounded in the current stack: React 18 + Vite + TS, lightweight-charts v5, zustand
stores (`viewStore`, `panelStore`, `scanStore`, `annotationStore`), the primitive/annotation
system, and the preset/URL-state layers already shipped.

---

## A. Multi-window / multi-monitor

### References
- TradingView Desktop: detach any tab (Ctrl/Cmd+N); **Crosshair Sync** + **Symbol Sync** across monitors.
- **Window Management API** (`getScreenDetails()`): enumerate screens, place/fullscreen a window on a chosen display (Chromium 100+; graceful fallback to `window.open` on Firefox/Safari).
- **BroadcastChannel API**: same-origin cross-window state sync; mature zustand middlewares exist.

### Model
- One app, many **window roles**. A role renders a subset of the UI:
  - `main` — full workbench (default).
  - `charts` — the 5-panel grid only.
  - `setups` — Setups list + detail + analytics.
  - `chart:<tf>` — a single detached chart.
- Role is read from the URL (`?window=charts`) so a popout is just the same bundle at a different route — no second build.

### State sync (the spine)
- A **sync layer** over the existing stores using one `BroadcastChannel("spekrym")`.
- Replicated: pair, asOf, timezone, linked, layout, strategy+params, scan results per TF,
  active setup, Steps step, hidden legend groups, trade overrides.
- Design rules:
  - **Last-writer-wins** per store slice; every message carries a `senderId` so a window ignores its own echoes.
  - **Debounce** high-frequency signals (crosshair time, visible-range) to ~30–60ms.
  - **Snapshot on open:** a new window requests a full snapshot (`hello`→`state`) so it starts in sync, then applies deltas.
  - Scans can be heavy: only the window that *ran* the scan broadcasts the result; others render it (no duplicate fetch).
- Crosshair/selection sync is a **separate lightweight channel topic** (`cursor`) so chart hover traffic never competes with state deltas.

### Placement (advanced, optional)
- With Window Management API: a **Workspace** = saved map of `{role → screenId, bounds, fullscreen}`.
  "Open workspace" calls `getScreenDetails()` and places each window (e.g. Charts → screen 2 fullscreen, Setups → screen 1 right-half).
- Without it: `window.open` with best-effort `left/top/width/height`; the user drags to the 2nd monitor once, then we remember bounds in a workspace preset.
- Reuses the **preset system** already built — a Workspace is a preset variant.

### UX
- `⤢ Pop out` on each panel header and each rail header.
- A **Windows menu**: list open windows, "pop out charts", "pop out setups", "save workspace", "restore workspace".
- A **monitor map** (only when the API is granted): a little diagram of detected screens; drag a role chip onto a screen to place it.
- Popouts are **chrome-light** (no app header unless `main`), maximising chart area on the 2nd monitor.
- Closing a popout returns its role to the main window (re-dock). Main window closing warns if popouts are open.

### Guardrails
- Feature-detect; never hard-depend on Window Management API.
- All sync is same-origin only; no data leaves the browser.
- If BroadcastChannel is unavailable (old browser), fall back to `storage` events on `localStorage`.
- Each window owns its **own chart instances** (lightweight-charts is not shareable across windows) — only *data/state* crosses the channel, never DOM/objects.

---

## B. Time-aligned multi-timeframe stack

### References
- "Multi-Time-Period Boxes" (nested HTF high/low boxes) and "HTF Candle Stack" — the *timeframe-within-a-timeframe* pattern: show a parent candle's span over its children.

### The honest constraint
lightweight-charts is **index-based** (one slot per bar; gaps collapse), so pixel-perfect
"1h candle exactly as wide as its 12×5m candles" fights the library. We get the same insight
a better way:

### Design: Linked-range stack + parent brackets (recommended)
- A **vertical column** of charts: `D · H4 · H1 · M15 · M5 · M1` (add D/W to the chart TF set; data already ingested).
- All charts **locked to one wall-clock time window** (shared `[from,to]` time range, not logical range). A 1h candle at time *T* then sits above the 5m candles in `[T, T+1h]`.
- On each **lower** chart, draw **parent-boundary verticals** at every higher-TF candle open, and **shade the active parent candle** (the hour under the cursor) using existing `window`/`bandfill` primitives.
- **Shared time crosshair:** hovering any chart drops the same vertical on all six — you directly see "these 12 M5 candles are inside this H1 candle."
- **Click-to-drill:** click a higher-TF candle → every lower chart zooms to exactly that candle's span (reuses "context flows down", applied to *time*). Breadcrumb + "back out" to restore.
- **Parent selector:** choose which TF is the "parent" whose boundaries are drawn on the children (default: each chart's immediate next-higher TF).

### Advanced touches (production-grade, still friendly)
- **Candle-count badge** per segment ("×12") so the nesting ratio is explicit.
- **Session-aware boundaries** (ET/London/NY) optional, reusing the strategy `display_tz`.
- **Annotations flow into the stack** — the scan's setup annotations already route by TF, so a setup lights up across the whole column at once.
- **Sync with Feature A:** the stack is just another window role (`stack`), so it can live on its own monitor.
- Respect the Steps scrubber: drilling/replay stays causal (`known_at`).

### Non-goals (v1)
- No pixel-exact proportional axis (documented constraint).
- No tick data.

---

## Cross-cutting
- **Perf:** one chart per TF; cap drawn boundary lines to the visible window; debounce range sync.
- **Accessibility:** every popout control is a real button with aria-labels; keyboard: `P` pop out focused panel, `[`/`]` already step.
- **State durability:** workspaces persist via the preset store (localStorage) and encode into URL for shareable links.
- **Testing:** sync layer and range-alignment math are pure/testable; window placement is feature-detected and mock-injected in tests.
