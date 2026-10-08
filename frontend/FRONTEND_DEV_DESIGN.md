# Spekrym-FX — Frontend Design (UI/UX, theme, features)

**Companion to** `FRONTEND_DEV_PHASES.md`. Date: 2026-10-08.
Production-grade, advanced-but-calm. This is the look, feel, interaction and component spec for
every roadmap phase. Build phases reference section numbers here.

---

## 0. Design principles
1. **Analyst desk, not a casino.** Dark, low-chroma, data-forward. Colour is a signal, never decoration.
2. **The chart is the hero.** Chrome is thin and recedes; panels maximise chart area, especially popouts.
3. **Honesty is visible.** Exploratory/stale/forming/edited states are always labelled, never implied.
4. **Shape carries meaning without colour** (status chips, direction) so it reads for colour-blind users and in both themes.
5. **Nothing moves without reason.** Motion only to show causality or state change; respects `prefers-reduced-motion`.
6. **Everything keyboardable.** Real buttons, aria-labels, visible focus.

---

## 1. Theme & tokens
Extend the existing `styles/tokens.css`; do not fork a second system. All colour via CSS variables;
every token defined for **dark (default)** and **light**, switched by `data-theme` with a
`prefers-color-scheme` fallback.

**Surfaces (dark):** `--bg #0d1016` · `--panel #141922` · `--panel-2 #1b2230` · `--border #263040`
· `--overlay rgba(13,16,22,.7)`.
**Text:** `--text #e6edf6` · `--muted #8a97a8` · `--faint #5a6678`.
**Accent:** `--accent #4ea1ff` (interactive/focus) · `--accent-weak color-mix(accent 18%)`.
**Semantic:** `--up #3fb27f` (bull) · `--down #e5636b` (bear) · `--warn #d9a441` · `--info #6ea8ff`.
**Role colours (existing):** `--role-fvg-bull/bear`, `--role-premium/discount`, `--role-order-block`,
`--role-liquidity`, `--role-range`, etc. — keep; MTF/stack reuse them.
**Light theme:** same token names, higher-key surfaces (`--bg #f5f7fb`, `--panel #ffffff`,
`--text #141922`), semantics darkened ~12% for contrast. Charts: local/static docs always render light; the pane syncs app theme.

**Typography:** UI sans (system stack); **numerals + prices/times in a mono stack** with
`font-variant-numeric: tabular-nums`. Sizes: 11px micro (chips/axis), 12px body, 13px labels,
15px section titles. Line-height 1.35.

**Spacing:** 2/4/6/8/12/16 scale. Panel gutter 8–12px. Rail width 240–280px, collapsible.
**Radius:** 3px controls, 6px cards, 999px pills. **Elevation:** 1 hairline border + a soft shadow
only on popovers/menus (not on flat panels).
**Motion:** 120ms ease for hovers/toggles; 180ms for panel reveals; crosshair/boundary updates are
instant (no transition). All gated by reduced-motion.
**Contrast:** WCAG AA for text and essential UI; never colour-only for pass/fail/direction.

---

## 2. App shell & window roles (W1, W4)
- **`main`** — full workbench: HeaderBar (controls) · LeftRail (strategy/params/layers) · stage
  (charts or stack) · RightRail (setups/detail/analytics/explain) · SummaryStrip.
- **`charts`** — stage only (grid or stack), no rails, a 28px mini-bar (pair · tz · linked · layout).
- **`setups`** — RightRail content full-height (list + filters + detail + analytics + explain).
- **`chart:<tf>`** — one maximised chart + mini-bar.
- **`stack`** — the MTF column (section 4), mini-bar + breadcrumb.
- **Chrome-light rule:** non-`main` roles drop the app title and heavy chrome; a single slim bar
  carries identity + a "⤓ re-dock" affordance. Popouts fill the monitor.

**Pop-out affordance:** `⤢` icon-button in every panel header and rail header, plus a **Windows
menu** (keyboard `P` pops the focused panel). Tooltip states the target ("Pop out charts to a new window").
On close, the role re-docks into `main`; closing `main` with popouts open warns.

---

## 3. Multi-window UX (W4–W7)
- **Windows menu** (dropdown from header): list open windows with role + live/synced dot; actions:
  pop out charts / setups / stack, Save workspace, Restore workspace.
- **Monitor map** (W6, only when the Window Management permission is granted): a small to-scale
  diagram of detected screens; drag a **role chip** onto a screen to place/fullscreen it. Primary
  screen marked. If permission denied/unavailable: hide the map, show plain "Open in new window"
  (user drags once; we remember bounds).
- **Workspaces** (W7): named layouts `{role→screen,bounds,fullscreen}`, saved as preset variants,
  shown in the Presets control; "Restore" reopens windows. Popup-blocker fallback: a queued
  "Click to open next window (2 of 3)" button (each open is a user gesture).
- **Sync feedback:** a tiny **link/presence indicator** in each window's mini-bar (dot = connected;
  count = other live windows). Never a modal; sync is silent when healthy.
- **Cross-window crosshair** (W5): the shared vertical appears in every window at the same time;
  selection highlight mirrors. Debounced; no jank on the occluded monitor.

---

## 4. Time-aligned MTF stack (S1–S7)
**Layout:** a single vertical column, top→bottom **D · H4 · H1 · M15 · M5 · M1** (parent selector can
change membership). Each row = a compact chart with a slim left gutter label (`H1`) and a right-edge
price axis. Row heights: taller for the focused parent TF, shorter for far TFs (config in
`ViewportPolicy`); user-draggable dividers.

**Focus model (S3):** one global **Focus** (an interval + parentTF). Each row derives its own
viewport so D shows ~20–40 bars and M1 ~100–300 around the *same* focus — never one shared range.
A **"Focus: 2026-03-02 10:00–11:00 (H1)"** chip sits above the column.

**Parent brackets (S4):** on every lower row, faint **vertical boundary lines** at each higher-TF
candle open; the **active parent candle** (the one under the cursor / the focus) is shaded with a
translucent `bandfill` in the parent's tone. Each segment carries a small **`×N` badge** (children
actually present; partial segments get a `~` and a muted tone). Boundaries come from real parent
bars; capped to the visible window for perf.

**Shared time crosshair (S5):** hovering any row drops one vertical on **all** rows at that time
(nearest-bar snapped per row), with a thin time flag on the axis. This is the core "see the 12 M5
candles inside this H1" moment — the H1 candle and its M5 children light under one line.

**Click-to-drill (S6):** click a higher-TF candle → the column drills into its span; lower rows zoom
to exactly that window. A **breadcrumb** (`D › H4 › H1 10:00`) shows depth; "← back" pops one level
(restores, never recomputes). Drilling animates with a 180ms ease to show the nesting.

**Causality & forming (S5/S7):** under replay/Steps, a forming parent shows only data up to `asOf`;
its bracket renders to the nominal end but **dashed with an "forming" tag**, and its `×N` counts
only known children. Nothing in the stack ever reads future data.

**Detached rows (S3):** local pan/zoom on one row marks it **detached** (a small "⟲ re-snap" button
appears); a later focus change does not yank a detached row until the user re-snaps.

**Annotations in the stack (S7):** scan/setup annotations route by TF, so selecting a setup lights it
across the whole column at once — HTF context above, entry/stop/target below.

---

## 5. "Explain this setup" (E6)
A compact, readable **causal story** in the RightRail under the setup detail: an ordered vertical
list of steps, each a row of `[time chip] condition → detail`, in `known_at` order, e.g.:

```
09:50  Equal highs tagged        2 touches, 0.4 ATR apart
09:55  Liquidity sweep           > 1.2 ATR beyond
09:58  Displacement              2.1 ATR impulse
10:00  H1 BOS (bullish)          known 10:00
10:02  Entry                     +2.0R target, 1.0R stop
```
- Pass/active steps use `--up`/`--text`; rejected/absent conditions muted with a `×`.
- Each row links to its annotation (hover highlights it on the chart).
- Header reminds: "Why this qualified" + the exploratory badge. Pure view over existing
  `conditions`/`steps`/`annotations` + `known_at`; no backend change.

---

## 6. States, feedback, honesty
- **Loading:** skeleton candles + "Loading {tf}…" overlay; never a spinner over a populated chart.
- **Empty:** "Pick a strategy, then Scan." / "No {tf} setups in range — widen the range."
- **Stale:** chip "stale · N" + a one-line "inputs changed; scan again."
- **Error:** inline `role="alert"` with a Retry; never a blank chart.
- **Forming/open:** dashed bracket + "forming" tag; what-if R always "· not the strategy's result".
- **Exploratory:** persistent SummaryStrip note "Exploratory scan — not validated by the Judge"; mock
  data labelled "generated for UI development, not real prices."

---

## 7. Accessibility & input
- All controls are real `<button>`/`<input>` with aria-labels; status conveyed by **shape + text**, not colour alone.
- Visible focus ring (`--accent`, 2px) on every focusable; logical tab order rail→stage→rail.
- Keyboard: `J/K` next/prev setup (exists), `[`/`]` step (exists), `P` pop out focused panel,
  `M` maximize, `Esc` restore, arrow/drag to pan (sets detached). Document in a `?` shortcuts sheet (Core 12).
- `prefers-reduced-motion`: disable drill/panel animations, keep instant state changes.
- Hit targets ≥ 24px; tooltips have accessible text, not title-only.

---

## 8. Responsive & performance
- Target: desktop-first, two-monitor; must stay usable on a single laptop screen (rails collapse to
  icons; stack scrolls; grid falls back to focus layout).
- One chart instance per TF; cap drawn boundary lines to the visible window; debounce range/cursor
  sync (~30–60ms); virtualize long setup lists.
- Popouts own their chart instances (lightweight-charts objects never cross windows); only state/data
  crosses the channel.

---

## 9. Component inventory → phase
| Component / module | Phase |
|---|---|
| `WindowRoot`, role chrome, mini-bar | W1, W4 |
| `PopoutButton`, `WindowsMenu`, presence dot | W4, W5 |
| `MonitorMap`, Workspaces UI | W6, W7 |
| `StackLayout`, row dividers, focus chip | S3 |
| `StackBrackets`, `×N` badge, active-parent shading | S4 |
| shared crosshair + axis time flag | S5 |
| `Breadcrumb`, drill animation, re-snap button | S6, S3 |
| `ExplainSetup` list | E6 |
| Settings panel, shortcuts sheet, state audit | Core 12 |
| excursion/range-consumption diagnostics | E8 (later) |

---

## 10. Visual language quick-reference
- **Direction:** ▲ bull `--up`, ▼ bear `--down`; never colour-only (always the glyph too).
- **Status chips:** filled = done, ring = idle, half = scanning, strike = stale, ✕ = error/unsupported (shapes from the existing `ChipShape`).
- **Brackets:** 1px `--faint` verticals; active parent = `bandfill` at ~8–12% alpha in parent tone.
- **Badges/pills:** 11px mono, `--panel-2` bg, `--border` outline; `×N` and indicator chips share this pill.
- **Edited/what-if:** `--warn` pill "edited"; what-if value always carries the "not the strategy's result" caveat.
- **Forming:** dashed + "forming"; **detached:** "⟲ re-snap"; **exploratory:** persistent strip note.
