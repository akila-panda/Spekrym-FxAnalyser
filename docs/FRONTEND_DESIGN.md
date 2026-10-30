# Spekrym-FX — Frontend Development: Design

**Companion to** `FRONTEND_PHASES.md`. Date: 2026-10-22. **Scope: `frontend/` only.**
Builds the trader-facing platform (Experience Plane + the frontend half of Visual Intelligence) **against mocks + the contracts in `docs/CONTRACTS.md`**, so the whole frontend is completed before the backend exists. Extends the DESK docs (`DESK_DESIGN.md`/`DESK_PHASES.md`, DK0–DK21 already built); where silent, DESK design applies.

**Reading map:** `MASTER_DEVELOPMENT_PLAN.md` → `contexts/{VISUAL_INTELLIGENCE,EXPERIENCE_PLANE}.md` → `CONTRACTS.md` → this file → `FRONTEND_PHASES.md`.

---

## 0. Vision & boundary
The frontend is the **integration surface**: it observes and controls research/analysis workflows through governed APIs, and **never owns a verdict, a holdout, or a risk override**. The guiding shift (visions C/D): the **chart is the primary interface** — read → click → see → investigate → decide — not a wall of text panels. Complexity lives in the system, not the trader's experience.

Three apps stay distinct — **Scan** (strategy lab, unchanged), **Desk** (analysis cockpit), **Relay** (cross-asset research). The new work hangs off Desk as the **Intelligence Canvas** plus new read-only surfaces. Frontend-first rule: every surface runs on a mock source + a frozen fixture, flips to `VITE_DATA_SOURCE=api` per surface when its backend lands, and the zod contract guarantees mock and real agree.

## 1. Information architecture
```
Spekrym-FX
├─ Scan                      (existing; unchanged — flips to api when backend parity lands)
├─ Relay                     (cross-asset research; no duplicated Judge)
└─ Desk
   ├─ MY DESK                (Prepare → Live → Review; methodology-driven)   [DK0–19 built]
   ├─ Analysis               (free-form; deeper investigation)               [built]
   └─ Intelligence Canvas    (NEW primary workspace: Prepare · Explore · Monitor · Review)
New surfaces (via window roles ?window=…, reserved today as <Reserved/>):
   analytics  → Research / Validation ledger board      journal → Trade journal
   + Portfolio Command, Research Workbench, Master Brain Console, Ops & Data Observatory
```
Window roles already exist (`window/role.ts`: main/charts/setups/stack/chart/**analytics**/**journal**). New surfaces fill the reserved roles (and add roles where needed), reusing the window/popout/two-screen system. Scan↔Desk keeps pair + timezone; nothing is lost on switch.

## 2. The Intelligence Canvas
A wide analytical cockpit; **chart ≈ 70–75%** of the workspace, reusing the existing MTF stack, shared crosshair, object geometry, and `viewAsOf`. Four **modes** with shared visual state:
- **Prepare** — the guided 6-step top-down walk (HTF context → key levels → session intelligence → structure & momentum → scenarios → session plan), each step with its own overlay preset, "show all"/per-object toggles/focus/explanation → a **frozen session plan**.
- **Explore** — free investigation: select engines, ask questions, compare TFs, build alternatives (opens into the existing Analysis workspace).
- **Monitor (Live)** — the frozen plan becomes the start state; events are classified against it (expected/unexpected/confirmed/invalidated/deteriorated/no-change); **Before/Now** compare without rewriting the thesis.
- **Review** — replay what was knowable; four separated axes (analysis quality · decision quality · process adherence · trade outcome).
Chart + source list + selected-insight panel + timeline are **synchronized**: select an insight → chart focus changes; select a chart object → its intelligence appears.

## 3. The Visual Intelligence layer (frontend half) — engines never draw directly
Everything an engine emits flows **gateway → orchestrator → mapping → chart**. The frontend owns rendering/selection/focus/visibility; durable intelligence events + provenance are backend. Modules (owner: `contexts/VISUAL_INTELLIGENCE.md`):
- **Intelligence gateway** — consume `IntelligenceInsight` (distinct from `AnalysisObject`).
- **Chart Mapping Engine** (`desk/canvas/chart-mapping`) — `IntelligenceInsight`/object → `ChartMapping` visual instruction; generalises the existing `desk/layers/adapter.ts`.
- **Visual Orchestrator + Smart Overlay Manager** (`desk/canvas/overlay-manager`) — prioritize · dedup · collision · semantic styling · visibility persistence + a **clutter budget**; critical warnings + invalidations never hidden, even under Simplify.
- **Spatial & Temporal Mapper** (`desk/canvas/rendering`) — a visual primitive per intelligence type (level / session shade / event marker / regime interval / risk window / dashed path / uncertainty envelope / conflict marker).
- **Scenario Studio** (`desk/canvas`) — conditional branches, triggers, invalidations; selecting a scenario updates the main chart.
- **Timeline & Replay** (`desk/canvas/timeline`) — replay the evolution of intelligence; recorded-vs-reconstructed labelled.
- **Visual Query** (`desk/canvas/query`) — NL → deterministic chart ops; the LLM selects verified objects, **never invents geometry**.
- **Dynamic Attention + Decision Compression** — prioritize attention; answer "what matters / watch next / what changes" (foundational, not extras).

## 4. Display priority & honesty
**P0 safety** (stale feed, invalidation, imminent scheduled-event risk, authorization failure) — always visible. **P1 actionable** (selected instrument, user plan, relevant scenario triggers). **P2 evidence** (supporting/contradictory structure + liquidity; one-click). **P3 background** (research features, raw metrics — behind drill-down). Budget by task + chart density; collapsed objects keep source identity. **Personal visibility controls never disable risk alerts or detection.**
The **five evidence types render with distinct visual identities** and never look interchangeable: observed fact · interpretation · conditional scenario · calibrated forecast · validated signal. **Discretionary ≠ validated.** No fabricated probabilities. A statement renders on the chart only if it resolves to real price/time geometry; non-geometric statements go to timeline markers or context panels.

## 5. Theme & tokens
Reuse `styles/tokens.css` only — **no new colours** (D9); accent gold `--accent #d8bc7a`; object→`--role-*` mapping as in `DESK_DESIGN §2`. New Canvas/surface styles under `styles/*.css` with clear prefixes (`dk-`, `vc-` for Canvas). Shape + text carry meaning, never colour alone. A design-system overhaul is a later coordinated pass, not now.

## 6. State classification & seams
Per `docs/state-classification.md`: **G** replicates via `sync/`, **W/V/E** local. Desk state stays local — **except** immutable plans/decisions/evidence snapshots/review records, which may gain durable storage + opt-in sync (D8); personal UI prefs stay local. New backend-fed stores are **ephemeral** (re-fetchable) unless a decision/draft, which follows the Desk local+localStorage convention. Nothing new joins the sync bus unless two windows must share a live selection.
Data seams (all consume `CONTRACTS.md`, mock-first): Scan `DataSource` (`api/dataSource.ts`), Desk `DeskSource` + the reserved **`getEngineObjects`** method, and new source methods for regime/trade/scenario/experiment/job reads. The `sourceFactory` `VITE_DATA_SOURCE` switch flips per surface.

## 7. URL / deep links & investigation
`ShareState` (`url/urlState.ts`) extends additively: `trade`, `experiment`, `regimeAt`, `canvasMode`. A **universal investigation context** lets selecting a trade / strategy / experiment / regime snapshot / dataset open the linked evidence across workspaces. Query-param state-mirroring only — no router; `?window=` role preserved across rewrites.

## 8. Accessibility & five-second tests
Carry DESK rules: real buttons, labelled controls, visible focus, `aria-live` for feeds, focus-trapped dialogs, every object keyboard-reachable, AA contrast dark+light, reduced-motion = instant, touch targets ≥ 32px, Minimal = small-screen default. Five-second tests (from Minimal & Standard): which pair/bias/next? · sample or live? · why is this here and when was it known? · how do I leave Focus? · what invalidates this?

## 9. Contracts consumed (source of truth: `docs/CONTRACTS.md`)
`ViewManifest`, `IntelligenceInsight`, `ChartMapping` (Visual Intelligence); `AnalysisObject`, `RegimeSnapshot`, `ContextInsight` (Market Intelligence); `ScenarioSpecification`/`ScenarioState`/`ForecastDistribution` (Scenario); `TradeRecord`/`OpportunityRecord`/`EligibilityDecision`/`PortfolioExposure` (Strategy/Trade/Portfolio); `Verdict`/`ValidationReport`/`evidence_tier` (Research OS); `SafetyVeto`/risk state (Safety); `Job` (async). Each gets a zod parser + a frozen fixture; `contractV2.test.ts` is the additive-extension precedent. The existing Scan contract (`SCAN_CONTRACT.md`) and `Sourced<T>` envelope are preserved unchanged.
```
Rule: the frontend renders causally or not at all — availableAt / viewAsOf bind every surface.
```
