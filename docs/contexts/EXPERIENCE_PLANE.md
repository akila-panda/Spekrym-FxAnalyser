# Context Deep-Dive — Experience Plane (Bounded Context #8)

Part of `docs/MASTER_DEVELOPMENT_PLAN.md` (Part II §5, context #8). Companion to the sibling context docs. Tags: **EXISTS / EXTEND / NEW / CONDITIONAL / DEFER**; evidence `[VERIFIED path:line]` (read 2026-10-22), `[DOC]`, `[PROPOSED]`.

> **One-line role:** the trader-facing surfaces — Desk, Intelligence Canvas, Scan, Relay, Research Workbench, Portfolio Command — guiding the user through a continuous workflow over the *same shared records*, showing only what helps the task, and never owning a verdict, a holdout, or a risk override.

---

## 1. Mission & boundary

**Owns.** The workspaces and their interaction: Desk (MY DESK Prepare/Live/Review + free Analysis), the Intelligence Canvas, Scan, Relay, Research Workbench, Portfolio Command, Ops & Data Observatory; chart-linked query; alerts; the journal; URL deep links; and **local-only** view preferences.

**Produces.** `ShareState` deep links and local view preferences; user actions (selection, focus, visibility, plan freeze, decisions) that become records *owned by other contexts* (a decision → [Strategy / Trade / Portfolio](./STRATEGY_TRADE_PORTFOLIO.md); a scenario → [Scenario Intelligence](./SCENARIO_INTELLIGENCE.md)).

**Explicitly does NOT own:**
- *Statistical verdicts* — it displays them from [Research OS](./RESEARCH_OS.md); it cannot change a tier or promote a strategy.
- *Holdout access* — the VAULT is backend-only; no UI action reaches it.
- *Risk overrides* — personal visibility controls never disable risk alerts or detection; the kill switch lives in [Safety / Execution](./SAFETY_EXECUTION.md).
- *How intelligence is composed onto the chart* — that is [Visual Intelligence](./VISUAL_INTELLIGENCE.md); the Experience Plane consumes `ViewManifest`s.

Boundary rule: *the Experience Plane observes and controls research/analysis workflows through governed APIs; it never owns analytical truth or authority.*

---

## 2. Current state (audited)

The frontend is mature: Scan is wired to a real backend seam, Desk DK0–DK19 is built, state-replication discipline is enforced, and there is a strong contract/fixture test net. The Intelligence Canvas, the reserved surfaces, and the display-priority policy are the new work.

| Capability | Status | Evidence |
|---|---|---|
| Window roles (main/charts/setups/stack/chart:tf) + `?window=` routing | **EXISTS** | `[VERIFIED frontend/src/window/role.ts:3-10]` |
| App switch: main role → Desk vs Scan; popouts always Scan | **EXISTS** | `[VERIFIED frontend/src/window/WindowRoot.tsx:99-110]` |
| `analytics` + `journal` roles are **reserved placeholders** | **EXISTS (stub)** | `[VERIFIED WindowRoot.tsx:91-97, 110]` (`<Reserved/>` "reserved for a later phase") |
| Scan: `scanRunner` + `DataSource` seam (mock default, `api` ready) + `httpSource` to `/api/*` | **EXISTS** | `[VERIFIED frontend/src/scan/scanRunner.ts; src/api/{dataSource,sourceFactory,httpSource}.ts]` |
| Desk DK0–DK19 (workspace, prepare/live/review, evidence, layers, confluence, brief, scorecard, replay, methodology, plan, journal) | **EXISTS** | `[VERIFIED frontend/src/desk/*]` |
| Desk source seam w/ reserved `getEngineObjects` hook (mock-only `api`) | **EXISTS** | `[VERIFIED frontend/src/desk/source/deskSource.ts, deskSourceFactory.ts]` |
| State classification + sync bus (G/W/V/E; BroadcastChannel; slices) | **EXISTS** | `[VERIFIED frontend/src/sync/protocol.ts:4]` (`DATA_SLICES` view/scan/scanResults/annotation/overrides/panel/cursor); `docs/state-classification.md` |
| URL `ShareState` deep links (additive; defaults omitted) | **EXISTS** | `[VERIFIED frontend/src/url/urlState.ts:8-22]` (pair/tz/linked/layout/mode/app/deskArea/wf/strategy/from/to/params) |
| Contract/fixture test net (zod + frozen backend fixtures + contractV2) | **EXISTS** | `[VERIFIED frontend/src/types/{schemas,contractV2}.test.ts; src/test/fixtures/*]`; ~124 test files |
| Relay cross-asset surface | **DOC (designed)** | `[DOC RELAY_DESIGN.md]` |
| **Intelligence Canvas** (primary Desk workspace; 4 modes; chart ~70%) | **MISSING** | — |
| **Chart-native guided Prepare** (6 steps, overlay presets → frozen plan) | **MISSING** | DK Prepare is a worksheet, not chart-native |
| **Live thesis-monitoring** (diff vs frozen plan, Before/Now) | **MISSING/partial** | DK Live has a change feed + readiness, not thesis-vs-plan |
| **Review decision-quality** (4 axes) | **MISSING/partial** | DK Review is level stats (scorecard) |
| **Research Workbench / Portfolio Command / Ops & Data Observatory** surfaces | **MISSING** | (analytics/journal roles reserved for these) |
| **Universal investigation context** (select X → linked evidence across workspaces) | **MISSING** | — |
| **Display priority policy P0–P3** | **MISSING** | ad-hoc today |

**Honest anchors:** the biggest UX shift (vision C/D) — chart as the primary surface, click-to-map, guided steps — is *not yet built*; today's Desk is panel-driven. But the seams exist (`getEngineObjects`, reserved roles, `ShareState`, mock-first), so the Canvas can be built additively without disturbing DK0–DK19.

---

## 3. Internal components / modules

| Component | Responsibility | Today | Target |
|---|---|---|---|
| **Window/role routing** (`window/`) | Map `?window=` to a surface; app switch | EXISTS | mount Canvas + fill reserved roles |
| **Scan workbench** (`scan/`, `components/`) | Strategy discovery, trial scans | EXISTS (mock/api) | flip to `api` per surface once backend parity lands |
| **Desk** (`desk/*`) | MY DESK Prepare/Live/Review + Analysis | EXISTS DK0–19 | host the Canvas; chart-native Prepare/Live/Review |
| **Intelligence Canvas** (`desk/canvas/*`) | Chart-centric 4-mode workspace over `ViewManifest`s | **NEW** | Prepare→Explore→Monitor→Review |
| **Data seams** (`api/dataSource`, `desk/source/deskSource`) | Governed reads; mock↔api factory | EXISTS | implement reserved `getEngineObjects` → real backend |
| **Sync** (`sync/*`) | G-class replication across windows; local stays local | EXISTS | relax "Desk never replicated" only for durable plans/decisions/snapshots |
| **URL/deep links** (`url/*`) | `ShareState` capture/apply | EXISTS | add trade/experiment/regimeAt fields; universal investigation context |
| **Reserved surfaces** | Research Workbench, Portfolio Command, Ops & Data Observatory | STUB (`<Reserved/>`) | build into `analytics`/`journal` (and new) roles |

---

## 4. Owned records & contracts (field-level)

### `ShareState` (EXTEND — `frontend/src/url/urlState.ts`)
```
ShareState {
  pair?; tz?; linked?; layout?; mode?                   # EXISTS [urlState.ts:9-14]
  app?: "desk"; deskArea?: "my"|"analysis"; wf?: "prepare"|"live"|"review"   # EXISTS [:16-18]
  strategy?; from?; to?; params?                        # EXISTS [:19-22]
  trade?; experiment?; regimeAt?                         # NEW: deep links to a trade/experiment/regime as-of
  canvasMode?: "prepare"|"explore"|"monitor"|"review"   # NEW
}
```
Invariant: additive + validated; unknown/malformed params are dropped, never thrown; a `?window=` role is preserved across URL rewrites. `[VERIFIED role.ts withRoleParam]`

### View preferences (local only)
Per-viewer, `localStorage` (`spekrym.desk.*`), never replicated — remembered layouts, toggles, collapsed sections. (DESK convention.)

### Consumed records (owned elsewhere, displayed here)
`ViewManifest` ([Visual Intelligence](./VISUAL_INTELLIGENCE.md)); `TradeRecord`/`PortfolioExposure`/`EligibilityDecision` ([Strategy / Trade / Portfolio](./STRATEGY_TRADE_PORTFOLIO.md)); `ValidationReport`/evidence tier ([Research OS](./RESEARCH_OS.md)); `RegimeSnapshot` ([Market Intelligence](./MARKET_INTELLIGENCE.md)); `ScenarioSpecification`/`ScenarioState` ([Scenario Intelligence](./SCENARIO_INTELLIGENCE.md)); `SafetyVeto`/risk state ([Safety / Execution](./SAFETY_EXECUTION.md)).

---

## 5. Interfaces — produces / consumes

| Direction | Counterparty | Contract / purpose |
|---|---|---|
| consumes ← | [Visual Intelligence](./VISUAL_INTELLIGENCE.md) | `ViewManifest` per surface/mode; universal-investigation payload |
| consumes ← | [Strategy / Trade / Portfolio](./STRATEGY_TRADE_PORTFOLIO.md) | `TradeRecord` (journal), `PortfolioExposure` (Portfolio Command), eligibility (Desk readiness) |
| consumes ← | [Research OS](./RESEARCH_OS.md) | experiments/verdicts/tiers (Research Workbench, analytics ledger board) |
| consumes ← | [Safety / Execution](./SAFETY_EXECUTION.md) | P0 risk strip, kill-switch state, Ops observatory |
| consumes ← | [Data Foundation](./DATA_FOUNDATION.md) | candles via `GET /api/candles`/`/bounds`; feed quality (Ops) |
| produces → | other contexts | user decisions/plans/scenarios (owned there); `ShareState` deep links; local prefs |

---

## 6. Guardrails & invariants
1. **Complexity hidden until it helps.** No feature-count navigation; the default surface is clean; machinery is progressive-disclosure. (Rule #7.)
2. **Display priority P0–P3.** P0 safety (stale feed, invalidation, imminent event risk, authorization failure) always visible; P1 actionable; P2 evidence; P3 background behind drill-down. Budget by task + chart density; collapsed objects keep source identity.
3. **Personal visibility never disables safety.** Hiding overlays is presentation only; it can never silence risk alerts or turn off detection.
4. **Observes, never decides.** The frontend cannot change a verdict, promote a strategy, reach the VAULT, or override risk — those are governed APIs owned by other contexts.
5. **Discretionary ≠ validated on screen.** A Desk setup and a validated signal render with distinct identities (via [Visual Intelligence](./VISUAL_INTELLIGENCE.md)).
6. **State classification respected.** G-class replicates via `sync/`; Desk state stays local — *except* durable plans/decisions/evidence snapshots/review records, which may gain durable storage + sync; personal UI state stays local. `[VERIFIED docs/state-classification.md]`
7. **Mock-first.** Every surface builds against mock sources + fixtures and flips to `api` per surface, so frontend-first work is never thrown away. `[VERIFIED sourceFactory.ts, deskSourceFactory.ts]`
8. **No new colours.** Reuse theme tokens.

---

## 7. Phases that build it (from the Master Plan)

| Phase | Deliverable | Depends | Definition of Done | Test plan |
|---|---|---|---|---|
| **W2.4** | **Trade-Intelligence panel + journal popout** (`?window=journal`), mock→api | W2.3 | records render; trade deep-link works | `*.test.tsx`; 124-suite green |
| **W3.5** | **Regime strip + analytical-family context panels** in Desk | W3.1 | regime at viewed time; `available_at` respected | widget + causal fixture tests |
| **VI-1** | **Intelligence Canvas shell**: large-screen layout, chart-focused interaction, source browser, overlay presets | VI-0 | shell renders; chart ~70%; source list synced | layout + sync tests |
| **VI-4** | **Scenario Studio** (Canvas mode) | VI-3, W4.2 | selecting a scenario updates the main chart | render + honesty tests |
| **VI-5** | **Prepare/Live integration**: 6-step guided prep → frozen session map; Live diff vs plan; Before/Now | VI-3, W3.1 | prep snapshot becomes Live's start state | prep-freeze + live-diff tests |
| **VI-6** | **Intelligence Timeline + Replay** (recorded-vs-reconstructed labels) | VI-0, W1.5 | replay rehydrates objects+insights at as-of | replay/live-parity test |
| **W6.1** | **Master Brain Console** (research objectives, proposals, permissions, budgets, approvals) | Research OS W1.5 | proposals shown as proposals; no promote from UI | console contract test |
| **W7.x** | **Portfolio Command** + **Research Workbench** surfaces (fill reserved `analytics`/`journal`) | W7.2, W1.x | exposure/eligibility + experiments render read-only | surface tests |
| **(UX)** | **Universal investigation context** + **display-priority policy P0–P3** + **Review decision-quality (4 axes)** | VI-3 | select X → linked evidence; P0 always visible; 4 axes separated | investigation-link + priority + review-axes tests |
| **(infra)** | Flip Scan (and each surface) to `VITE_DATA_SOURCE=api` as backend parity lands | per backend phase | surface runs on real data | contract tests vs real fixtures |

---

## 8. Context-specific acceptance tests
- **Usability:** a trader can answer "what matters / what next / what invalidates" in seconds on a clean default chart.
- **P0 always visible:** stale feed / scenario invalidation / authorization failure stay on screen even under Focus/Simplify and with overlays hidden.
- **No authority leakage:** no UI path changes a verdict, promotes a strategy, reaches the VAULT, or overrides a risk veto.
- **Deep link:** `?app=desk&pair=…&trade=<id>` resolves to the trade centred on its interval with its regime + decision trace.
- **Mock↔api parity:** a surface renders identically against the mock fixture and the real backend (same zod shape).
- **Replay honesty:** replaying a session labels live-recorded vs reconstructed insights.
- **State discipline:** Desk view prefs never cross windows; only durable plans/decisions/snapshots replicate when enabled.

---

## 9. Open decisions affecting this context
- **Decision 1 Target users** — single expert vs team → whether surfaces need multi-user roles/permissions in the UI.
- **Decision 6 Sharing** — local prefs vs synchronized plans/decision artifacts. Directly sets how far to relax "Desk never replicated". Recommended: **local prefs stay local; plans/decisions/snapshots get durable storage + opt-in sync.**
- **Decision 7 Visual design** — reuse theme tokens first (recommended) vs a design-system overhaul coordinated across Scan/Desk/Relay/Research.
- **Canvas vs new top-level app** — Intelligence Canvas as a primary workspace *inside* Desk (recommended) vs a fourth app. Recommended: inside Desk, reuse the window system.
- **Which reserved role hosts what** — `analytics` → Research/Validation ledger board; `journal` → trade journal; Portfolio Command + Ops Observatory need new roles or a sub-navigation.

---

## 10. Code namespaces & tests to keep green
**Proposed namespaces:** `frontend/{desk,scan,relay,research,portfolio,observability}` + `frontend/src/desk/canvas/{chart-mapping,overlay-manager,rendering,interactions,presets,timeline,query}`.
**Existing to extend:** `frontend/src/{window,scan,desk,sync,url,api}/*`, the DESK DK0–19 modules, the `DataSource`/`DeskSource` seams.
**Tests that must stay green:** the ~124-file frontend suite — especially `types/{schemas,contractV2}.test.ts`, `src/test/fixtures/*`, the Scan `scanRunner`/`paramState` tests, and the DESK suites (detect/kernel/prepare/live/review/evidence/layers/confluence/plan/journal). New surfaces are additive and mock-first.

---

## 11. Cross-context dependencies
- **Renders** everything via [Visual Intelligence](./VISUAL_INTELLIGENCE.md) `ViewManifest`s — the Experience Plane never draws intelligence itself.
- **Displays but does not decide:** verdicts/tiers from [Research OS](./RESEARCH_OS.md); eligibility/trades/portfolio from [Strategy / Trade / Portfolio](./STRATEGY_TRADE_PORTFOLIO.md); regime from [Market Intelligence](./MARKET_INTELLIGENCE.md); scenarios from [Scenario Intelligence](./SCENARIO_INTELLIGENCE.md); P0 risk from [Safety / Execution](./SAFETY_EXECUTION.md).
- **Reads candles** from [Data Foundation](./DATA_FOUNDATION.md) via the existing `/api/candles`/`/bounds` seam.
- **The continuous workflow** Prepare → Explore → Monitor → Decide → Review is this context's spine; it stitches the other seven contexts into one trader experience without owning any of their authority.
- **Relay** stays a distinct research surface (no duplicated Judge), connected through shared objects + deep links.
