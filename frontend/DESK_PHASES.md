# Spekrym-FX DESK — Build Phases & Contracts

**Companion to** `DESK_DESIGN.md`. Date: 2026-10-12. Condensed from the DESK planning pack (11 files).
**Scope: frontend only** (`frontend/`). One phase per session; finish → verify → report files → STOP (WAIT).

**Definition of done (every phase):** `npm run typecheck` + `npm test` + `npm run build` pass · new logic has
tests · **every detector passes the no-lookahead harness** · no backend/API/DB/Python · **no new colours** ·
no Scan behaviour change (Scan tests stay green) · every new UI element keyboard-reachable + accessible name +
non-colour cue · mock surfaces show "sample" · update progress + deviations · output = files created/modified
only. Keep prose < 400 words excluding code.

**Do NOT touch:** `sync/`, `scan/`, `components/setups/`, `api/httpSource.ts`, `api/client.ts`, any Python,
`backtest/`, `research/`. Desk state is local (`spekrym.desk.<name>.v1`), **never replicated**; never bind a
Desk store in `sync/`; never write `viewStore.asOf` (Desk has its own window-scoped clock).

---

## A. Architecture contracts (build in DK0; everything depends on these)

**Object model** (`desk/types/object.ts`, zod + inferred):
```
ObjectType = swing | structure_event | sr_level | reference_level | fvg
           | liquidity_pool | sweep | sd_zone | trendline | range | impulse | candle_signal | relation
AnalysisObject = { id, type, layer, pair, source_tf, direction?, geometry(bands+time anchors),
  t_event, known_at, confirmed_at|null, lifecycle: LifecycleEvent[], origin_id?, grade?,
  provenance{ rulesVersion, dataKind: sample|live, detector, detectorVersion }, evidence[] }
```
- **id = `type:pair:tf:anchorTimes`** (price excluded, so recalculation keeps the id). Methodology changes
  alter `rulesVersion`, not `id`. Times are **UTC seconds** internally.
- **Four timestamps:** `t_event` (drawn), `known_at` (first knowable = confirmation bar close),
  `confirmed_at` (later upgrade), `decided_at` (**on the user decision, not the object**).
- **Lifecycles** append-only; state at `t` derived by `viewAsOf`. sr_level: emerging→established→tested→
  broken→role_reversed · sd_zone: fresh→tested→partially_mitigated→fully_mitigated→invalidated · fvg:
  open→partially_filled→filled (+invalidated/inverted) · liquidity_pool: potential→swept→reaction_observed→
  resolved/superseded · trendline: candidate→active→broken. Map to `Annotation.state` in the adapter.

**Detection pipeline:** `closedBars(candles,tf,asOf)` → kernel (one swing engine · ATR14 · displacement →
`origin_id`) → detectors → relations (overlap/nested/contains/shared_origin) → confluence (supports/opposes/
unavailable). **Detect high, project low** (W/D→all lower; H4→M1; H1→M1; M15→M1; M5/M1 native) with a
relevance filter (within k×ATR(viewTf) of price, or last-N). Memoise by `(pair,tf,asOfBucket,methodHash,
dataVersion)`. Budget: all detectors, one TF, 5,000 bars ≤ 150 ms (else Web Worker — detectors are DOM-free).

**Detect vs grade:** detect = exists? (geometry + lifecycle). grade = `{significance, relevance, quality,
freshness, factors[]}` computed separately; any composite is labelled **"heuristic"**, never a probability.

**viewAsOf / honesty:** only **closed** bars feed detectors (`time + TF_SECONDS[tf] <= asOf`; forming bar
excluded). `viewAsOf(objects,t)` filters `known_at<=t` and folds lifecycle `known_at<=t` — **one code path**
for chart, replay, brief, export. **No-lookahead harness:** `viewAsOf(detect(full),t) == detect(prefix(t))`
(modulo ids) at sampled times incl. bar close ±1 ms; every detector registers before merge.

**DeskSource** (beside `api/dataSource.ts`, not inside): `Sourced<T>{data, provenance{kind:sample|live,
asOf,fetchedAt,stale?}}`; `capabilities/getCandles/getEvents/getSessions/getPositioning`; mock scenarios via
`?deskScenario=stale|missing|conflict`. UI renders "sample" from `provenance.kind`, never per-widget.

**State classes (own stores, localStorage, versioned, quota-guarded, migrate() stub, copy `reviewStore`):**
analytical (memo cache, no persist) · decisions (`spekrym.desk.decisions.v1`) · snapshots/plans · methodology ·
preferences/workspace · ephemeral (selected/hover/drawer/replay clock, no persist). Reads `pair`/`timezone`
from `viewStore`; popouts refresh via the `storage` event (not the sync layer).

## B. Reuse map (verified against repo — do not re-explore)
`types/market.ts` (`PAIRS` 5 majors, `TIMEFRAMES` M1…W, `TF_SECONDS`, `TF_ANCHOR` D=22:00/W=Sun22:00,
`bucketStart`, `isHigherTf`, `PAIR_META`, `Candle.time`=UTC s) · `types/schemas.ts` (`AnnotationSchema`:
level/zone/line/marker/text/band/bandfill/fib_zone/banded_zone/bar_highlight/series; `rayExtras.state`;
`KNOWN_ROLES`) · `annotations/{routing,visibility,roles,primitives,usePanelAnnotations}` (adapter target;
**recon `usePanelAnnotations` in DK3 → add an optional extra-annotations input, don't fork**) · `stack/*`
(StackLayout, rowsStore, viewportPolicy, focusStore, shared crosshair, drill, brackets, RowsMenu) ·
`window/{role,WindowRoot,popout,dockStore,screens,twoScreen,workspaces}` (roles `analytics`/`journal`
reserved for Desk popouts) · `components/layout/{HeaderBar,RailAccordion,modes}` (Desk is app-level, **not** a
mode) · `commands/{registry,actions,fuzzy}` + `components/ui/{CommandPalette,ShortcutsSheet,Icon,settingsStore}`
· `review/reviewStore.ts` (store pattern template) · `export/exportScan.ts` (export pattern) ·
`styles/tokens.css` (accent gold `#d8bc7a`). **Gaps to build:** closed-bar kernel, detectors, deep mock,
Desk stores, Pine generator, calendar/session/COT/book mocks, Desk shell + widgets.

---

## C. Phases (DK0–DK21). `☐` not started. Specs: §A/§D + `DESK_DESIGN.md`.

### Milestone M1 — Foundations visible
- **DK0 — Foundation & contracts.** zod schemas + types (§A), `DeskSource` + mock + scenarios, storage/id/hash
  libs, `methodology/defaults.ts` (§D), widget registry, state-classification rows. *No UI.* Tests: schema
  round-trip, id stability (price change keeps id), rulesVersion changes with params, quota/corrupt, mock=sample.
- **DK1 — Shell, MY DESK, complexity, Focus.** `Scan|Desk` switch (HeaderBar), `DeskRoot` mounts in
  `WindowRoot` (main role), `appStore/deskStore/deskUiStore/complexity/focus`, `DockLayout/WidgetFrame`,
  `styles/desk.css`, URL `app/desk/wf`, Desk commands + shortcuts, pinned-warning strip (empty). Three levels
  via `minLevel`; workflows with 3 placeholder widgets; Simplify reversible; Focus + Restore. Tests: switch
  keeps pair/tz; level gating; Focus keeps warnings+Restore; Simplify restores exactly; no key conflicts;
  Scan untouched; no `sync/` import.
- **DK2 — Detection kernel, causal harness, deep mock.** `closedBars/swings(2 scales)/atr/displacement`,
  `viewAsOf`, harness helper, golden `__fixtures__` (trend/range/sweep/fvg/zone), **Desk-only deep mock**
  (W≥260, D≥1300, H4≥1500, H1≥2000, M15/M5/M1≥3000; existing `generateCandles.ts` untouched). Record kernel
  time on 5,000 bars. Harness proves prefix-equality.
- **DK3 — Analysis pipeline.** `detect/registry` (memoise), `layers/{adapter,layerStore,layerPresets,
  projection,relevance}`, `LayersPanel`, `evidence/{describe,EvidenceDrawer}`, relations plumbing, a sample
  detector from fixtures. Adapter output validated vs `AnnotationSchema`; projection ladder + relevance + caps
  + quiet styling; evidence drawer 3 depths. Tests: adapter parses; ladder/caps; Minimal cap 3; projected keeps
  `source_tf`; **no object with `known_at > asOf` reaches the chart**.

### Milestone M2 — First usable trading day
- **DK4 — Market structure** (§D.2): HH/HL/LH/LL, BOS/CHoCH, trend per TF, protected high/low, close/wick rule,
  min-break; detected per TF, projected quiet. Fixtures incl. failed CHoCH; ambiguity → transitioning.
- **DK5 — Respected S/R & reference levels** (§D.3): swing clusters→bands, reaction counting, strong-single,
  significance vs relevance, lifecycle incl. role reversal, band-width cap; PDH/PDL/PDC, PWH/PWL, opens,
  session H/L (approx until DK15), round numbers.
- **DK6 — Prepare workflow & worksheet:** `prepare/{walk,checklist,snapshotStore}`, `decisions/decisionStore`,
  step rail W→M1, inbox `J K Y N R` + undo, custom levels, auto-tick checklist, **immutable snapshot**.
- **DK7 — TradingView export:** client-side Pine v6 for accepted/active items, limits meter (500 lines/boxes,
  100 polylines, 64 plots), manifest (snapshot id, rulesVersion, data kind), escaping, plain-list fallback,
  "sample" stamp. Follow `exportScan.ts`. **Gate G1** (use on a real day; decide fixes).

### Milestone M3 — Full six-layer analysis
- **DK8 — FVG** (§D.4): bull/bear, min size, fill/invalid/inverted separate, CE line, nearest-N, overlap
  relations with "nested" flag.
- **DK9 — Liquidity pools & sweeps** (§D.5): pools (exist before sweeps) + sweeps (wick_sweep vs close_beyond),
  5-day rolling window on detection TF, follow-through as independent facts.
- **DK10 — Supply & demand** (§D.6): validity checklist, bounds options, OB tag + >70% overlap merge,
  lifecycle (mitigation/invalidation), shares `origin_id`.
- **DK11 — Price action** (§D.7): trend/range class, trendlines (best 2/TF, accept-reject), impulse/correction,
  ranges/breakouts/retests, candle signals **only within location**, premium/discount → feeds S/D location.
- **DK12 — Confluence & MTF relations:** factor breakdown (supports/opposes/unavailable), contradictions
  first-class, `origin_id` dedupe, "multi-timeframe confluence area" (never a prediction). **Gate G2** (clutter +
  default params review).

### Milestone M4 — Decide & trade
- **DK13 — Decision Brief:** pure `buildBrief` → state/context/confirm/invalidate with evidence links;
  "No actionable setup" / "Insufficient evidence"; never buy/sell.
- **DK14 — Live workflow & Change Feed:** diff objects over time → events, acknowledge/dismiss/note, readiness
  chain (**needs OQ-1**), thesis vs changes, `aria-live`.
- **DK15 — Context widgets:** calendar markers, session clock (Asia/London/NY, DST-aware — **needs OQ-7**),
  ADR/volatility; replaces "approx" session levels; high-impact-soon pinned warning.
- **DK16 — Plan, Decision Recorder, journal:** plan (idea/confirm/invalidation/target R/risk/linked objects),
  recorder freezes evidence+bias+rulesVersion+as-of, tags, filters, static snapshot.
- **DK17 — My Methodology editor & versioning:** edit all detector params; each change = new `rulesVersion`;
  old snapshots keep theirs; reset/diff vs defaults. **Gate G3** (methodology freeze before scorecard).

### Milestone M5 — Review, memory, polish
- **DK18 — Replay & Evidence Timeline:** play/pause/step/speed on `deskUiStore.asOf` (never `viewStore.asOf`);
  all via `viewAsOf`; reduced-motion = step only.
- **DK19 — Level scorecard:** protocol written first; counts per zone type/pair/session/TF with sample sizes +
  intervals; "exploratory"; small-sample suppression; tests §D.10 hypotheses; **never auto-tunes methodology**.
- **DK20 — Positioning & strength:** COT, retail book (capability-gated "unverified/available/absent"),
  strength/correlation; "weekly/snapshot/sample" badges.
- **DK21 — Polish & integration:** full palette/shortcuts, Desk popouts (`journal` role) with `storage` refresh,
  two-screen Desk preset, empty states + guided first run, density toggle, small-screen Minimal default, data
  export/clear, a11y pass, five-second tests, perf (worker if DK2 demands).

**Dependencies / gates:** critical path DK0→DK2→DK3→DK4/DK5→DK6→DK7 (G1). DK8–DK11 independent once DK3 exists.
DK15/DK20 depend only on the shell (can be pulled forward). Gates G1 (after DK7), G2 (after DK12), G3 (after DK17).

---

## D. Detector defaults (starting values — `methodology/defaults.ts`; editable in DK17; approve via OQ-6)
- **Units (locked):** all detector thresholds are in **ATR** (volatility-adaptive, cross-pair/TF). ATR is
  the internal measuring stick only — the **UI displays distances in pips** (ATR secondary, e.g. "8.3 pips ·
  1.4 ATR"). Pips also drive fixed references (round numbers, `PAIR_META`). Unit switch deferred to DK17.
- **Swing N per TF:** W 2, else 3. Two scales: internal (N) + swing (N×3). **ATR** Wilder 14, warm-up null.
  **Displacement** ≥ 1.5×ATR (run ≤ 3 same-dir bars) → `origin_id`.
- **Structure:** break rule `close` (default) or `wick`; min break 0.1×ATR; <2 confirmed swings/side ⇒
  transitioning/range (no forced trend). CHoCH = *potential change*, never "reversal".
- **S/R:** cluster 0.5×ATR (band cap 1.5×ATR); reaction = depart ≥ 1.5×ATR within 10 bars without closing
  through; reactions ≥ `minGapBars` 5 apart; respected ≥ 2 (intraday 3); strong-single if depart ≥ 3×ATR;
  break 0.25×ATR. TF weight W1.0/D0.8/H4 0.6/H1 0.4/M15 0.25/M5 0.15/M1 0.1.
- **FVG:** min 0.25×ATR; fill wick-rule (close configurable); invalidated/inverted separate.
- **Liquidity:** equal-highs/lows within 0.1×ATR; wick_sweep ≥ 0.05×ATR beyond then closes back; window 5
  trading days on H1 (option H4/D).
- **S/D:** base 1–6 bars ≤ 0.8×ATR, departure ≥ 2.0×ATR within 3 bars; partial = entered, full = through
  midpoint, invalidated = close beyond far edge; OB/S-D overlap > 70% merge.
- **Price action:** trendline touches 0.3×ATR, ≥ 3 swings, keep best 2/TF/dir; candle signals only within
  `locAtr` of a level/zone/pool/FVG. Premium/discount from the current confirmed range (50% equilibrium).
- **Visibility:** per-layer cap Standard 8 / Advanced 20 / Minimal total 3.
- **Hypotheses (DK19, descriptive only):** FVG fill rate; reaction rate at FVG/S-D edges; sweep→displacement
  direction; nested HTF/LTF confluence vs single-TF. Geometry is observable; edge is empirical.

## E. Owner decisions (defaults in brackets; needed by the phase shown)
- **OQ-1** your real during-session routine beyond HTF zone→LTF sweep→CHoCH/BOS→FVG [use that 4-step chain] — DK14.
- **OQ-2** may Desk reuse `--accent`? [yes] — DK1.
- **OQ-3** instruments = 5 majors only, or add XAU/indices/crosses? [5 majors] — DK2.
- **OQ-4** TradingView feed/timezone (day/week roll)? [keep FX roll, note in manifest] — DK7.
- **OQ-5** when do real multi-year candles arrive? [treat mock as only source] — DK2.
- **OQ-6** approve detector defaults in §D? [use as written, review at G2] — DK2.
- **OQ-7** session definitions (Asia/London/NY, kill zones)? [00–08 / 07–16 / 12–21 UTC, "approx"] — DK15.
- **OQ-8** keep Analysis separate or fold into MY DESK? [keep] — DK1.
- **OQ-9** Minimal contents? [1 TF + 1 quiet HTF] — DK1.
- **OQ-10** Desk ever writes back to Scan? [no, one-way] — DK21.

## F. Session protocol (token savers)
Start a build session by reading only: this file's phase block + §A/§B + the `DESK_DESIGN.md` section it needs.
Add small files over growing big ones (< 250 lines; hook edits in existing files < 30 lines). Golden fixtures,
not inline candle arrays. Run typecheck/test/build once at the end (`| tail`). One phase, then STOP (WAIT).
Backlog (not scheduled): ICT pack, Context Lens, Contradiction Radar, scenario branches, analysis diff,
alerts (needs backend), market profile, classic patterns, seasonality.
