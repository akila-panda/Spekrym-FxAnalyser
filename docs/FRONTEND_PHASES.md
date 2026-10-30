# Spekrym-FX — Frontend Development: Build Phases

**Companion to** `FRONTEND_DESIGN.md`. Date: 2026-10-22. **Scope: `frontend/` only.** One phase per session; finish → verify → report files → STOP (WAIT).

**Definition of done (every phase):** `npm run typecheck` + `npm test` + `npm run build` pass · new logic has tests · builds against **mock sources + frozen fixtures conforming to `docs/CONTRACTS.md`** · **no backend/API/DB/Python** · causal surfaces pass the no-lookahead/`viewAsOf` discipline · **no new colours** (reuse `--role-*`) · Scan + DESK DK0–19 behaviour unchanged (their tests stay green) · every new UI element keyboard-reachable + accessible name + non-colour cue · mock surfaces show "sample" · the 5 evidence types render with distinct identities · P0 warnings never hidden · report files created/modified only. Prose < 400 words excluding code.

**Do NOT touch:** `sync/` bindings (no new replicated store without a classification row), `scan/` behaviour, any Python/`backtest/`/`research/`. New stores are local (`spekrym.desk.<name>.v1`) unless a classification row says otherwise (durable plans/decisions/snapshots per D8).

---

## Baseline (DONE — do not rebuild)
Scan cockpit (MTF stack, annotations, `DataSource` seam live-ready); **DESK DK0–DK19** (shell, Prepare/Live/Review, Analysis, 6-layer causal detectors + kernel + `viewAsOf` + no-lookahead harness, evidence drawer, layers, confluence, brief, scorecard, replay, methodology, plan, journal); contract/fixture test net (~124 files, `types/{schemas,contractV2}.test.ts`). DK20–DK21 remain open in the DESK plan and are folded into FM3/FM5 below.

## Reuse map (verified; do not re-explore)
`window/{role,WindowRoot,popout,dockStore,screens,workspaces}` (reserved roles `analytics`/`journal`) · `desk/{detect,kernel,layers,evidence,confluence,prepare,live,review,methodology,plan,scorecard,replay,workspace}` (DK0–19) · `desk/layers/adapter.ts` (object→Annotation drawing contract; generalise, don't fork) · `desk/detect/relations.ts` (`shared_origin` dedup seed) · `desk/source/{deskSource,deskSourceFactory,mockDeskSource}` (+ reserved `getEngineObjects`) · `api/{dataSource,sourceFactory,httpSource}` · `url/{urlState,shareState,useUrlState}` · `sync/` (classification only) · `components/ui/{CommandPalette,ShortcutsSheet,settingsStore}` · `styles/tokens.css`. **Gaps to build:** Canvas shell + chart-mapping/overlay-manager/rendering/timeline/query, intelligence gateway, new read surfaces, new mock sources + fixtures for the `CONTRACTS.md` records.

---

## Milestones & phases (F-track). `☐` not started.

### FM0 — Contracts & mock sources (foundation; everything depends on these)
- **F0 — Frontend contracts + mock sources.** zod parsers for `IntelligenceInsight`, `ViewManifest`, `ChartMapping`, `RegimeSnapshot`, `ScenarioSpecification`/`ScenarioState`, `TradeRecord`/`EligibilityDecision`/`PortfolioExposure`, `Verdict`/`evidence_tier`, `Job` (per `CONTRACTS.md`); mock sources + frozen fixtures for each; implement `DeskSource.getEngineObjects` (mock). *No new UI.* Tests: schema round-trip; fixture parse; mock labelled "sample"; additive-extension (contractV2 pattern).

### FM1 — Intelligence Canvas core (VI-0…VI-3)
- **F1 — Canvas shell (VI-1).** New primary Desk workspace: large-screen layout, chart ≈70%, source browser, overlay presets, 4 empty modes; `vc-` styles; URL `canvasMode`. Tests: shell renders; source list syncs with chart; Scan/DESK untouched.
- **F2 — Chart Mapping Engine (VI-2).** `IntelligenceInsight`/object → `ChartMapping`; generalise `desk/layers/adapter.ts`; focus + evidence on select. Tests: insight → highlighted geometry; **never draw before `known_at`/`availableAt`**.
- **F3 — Visual Orchestrator + Smart Overlay Manager (VI-3).** Normalize/relate/prioritize/dedup/collision/visibility + **clutter budget**. Tests: 4 engines on one zone → 1 primary + evidence stack; contradictions not averaged; P0 warnings + invalidations never hidden under Simplify.
- **F4 — Spatial & Temporal Mapper.** A primitive per intelligence type (levels/session/events/intervals/paths/envelopes/conflict). Tests: each primitive renders; causal placement. **Gate GF1** (clutter + legibility on a real multi-engine map).

### FM2 — Guided chart-native workflow
- **F5 — Prepare (chart-native, 6 steps).** Guided walk with per-step overlay presets → **frozen session plan**; reuses DESK Prepare snapshot. Tests: step presets map to chart; plan freezes immutable.
- **F6 — Live / Monitor (VI-5).** Frozen plan = start state; event classification vs plan; **Before/Now** compare; thesis shown unchanged. Tests: live diff vs plan; no rewrite of frozen thesis.
- **F7 — Review (4 axes).** Separate analysis quality · decision quality · process adherence · trade outcome; replay what was knowable. Tests: axes independent; losing-trade-good-process case.
- **F8 — Explore mode.** Free investigation + engine toggles; opens into Analysis without losing the workflow. Tests: toggles recompute display only, not detection. **Gate GF2** (full Prepare→Monitor→Review loop on mock data).

### FM3 — Intelligence surfaces (VI-4/6/7 + DK20-ish)
- **F9 — Regime strip + analytical-family context panels (W3.5).** Consume `RegimeSnapshot`; families feed context panels, not chart clutter. Tests: regime at viewed time; `available_at` respected.
- **F10 — Trade-Intelligence panel + journal popout (`?window=journal`).** Consume `TradeRecord` (4 categories); trade deep-link (`?trade=`). Tests: records render; deep-link centres the trade.
- **F11 — Scenario Studio (VI-4).** Conditional branches + triggers + invalidations; selecting a scenario updates the main chart; Category B/C visually distinct; no fabricated %. Tests: render + honesty.
- **F12 — Intelligence Timeline + Replay (VI-6).** Replay the evolution of intelligence; recorded-vs-reconstructed labels; reduced-motion = step. Tests: rehydrate at as-of; label integrity.
- **F13 — Cross-engine integration onto Canvas (VI-7).** Regime/trade/scenario/macro/(mock) brain insights with distinct identities; discretionary ≠ validated. Tests: per-source visual identity. **Gate GF3** (every engine's mock output readable on one chart).

### FM4 — Research & portfolio surfaces (reserved roles)
- **F14 — Analytics / Validation ledger board (`?window=analytics`).** Read-only experiments/verdicts/tiers/`experiment_count`/vault-consultation counter. Tests: ledger renders; "tested N variants" shown; read-only (no promote from UI).
- **F15 — Research Workbench.** Hypotheses, DAG jobs, strategy versions, validation (consume `Job`, `ValidationReport`). Tests: job status renders; deep-link to chart evidence.
- **F16 — Master Brain Console (W6.1).** Proposals shown **as proposals**, permissions, budgets, approval queues. Tests: proposals labelled; no promote from UI.
- **F17 — Portfolio Command (W7).** `PortfolioExposure`: allocation, combined exposure, DD, eligibility matrix, lifecycle. Tests: exposure renders; drill to underlying decisions.
- **F18 — Ops & Data Observatory.** Feed quality, broker sync, compute jobs, model drift (expert access). Tests: P0 stale-feed surfaces.

### FM5 — Assist, investigation & hardening
- **F19 — Visual Query assistant (VI-8).** NL → structured retrieval → deterministic chart ops; LLM invents no geometry. Tests: query focuses chart + opens evidence; determinism.
- **F20 — Dynamic Attention + Decision Compression.** Prioritize attention (user-overridable); "what matters / watch next / what changes". Tests: attention override; compression correctness.
- **F21 — Universal investigation context.** Select trade/strategy/experiment/regime/dataset → linked evidence across workspaces; `ShareState` deep links. Tests: investigation link resolves cross-surface.
- **F22 — Production hardening (VI-9) + per-surface api-flip.** Perf (60 FPS, ~100ms toggles, incremental updates), a11y pass, replay/live parity, failure recovery; flip each surface to `VITE_DATA_SOURCE=api` as its backend endpoint + real fixture land. Tests: perf/a11y/parity benchmarks; contract tests vs real fixtures.

---

## Dependencies & gates
Critical path: **F0 → F1 → F2 → F3 → F4 (GF1) → F5/F6/F7 → F8 (GF2)**. FM3 surfaces (F9–F13) depend on F3; F11 depends on Scenario mocks (F0). FM4 surfaces (F14–F18) depend only on F0 + their mock fixtures — pull forward freely. FM5 depends on FM3. **GF1** (after F4), **GF2** (after F8), **GF3** (after F13). The api-flip (F22) per surface depends on the matching backend phase (`BACKEND_PHASES.md`) landing — but the UI ships on mocks first and never blocks on it.

## Owner decisions (see `docs/DECISIONS.md`)
D9 visual design (reuse tokens — yes), D8 sharing (durable plans/decisions/snapshots only), D1/D2 (cost model/reference — affect what Trade/Ledger surfaces display), D6 authority (shadow-only — Portfolio/Brain surfaces are read-only/observe), D10 (regime deterministic first — no fabricated %). Confirm before FM3/FM4.

## Session protocol
Start a session by reading only: this phase block + the relevant `FRONTEND_DESIGN.md` section + the `CONTRACTS.md` record(s) + the owning `contexts/*.md`. Small files over big ones (< 250 lines; hook edits < 30 lines). Frozen fixtures, not inline arrays. Run typecheck/test/build once at the end (`| tail`). One phase, then STOP (WAIT).
```
Frontend completes on mocks + contracts. Backend (BACKEND_PHASES.md) then implements the same contracts; each surface flips to api in F22 with no UI rewrite.
```
