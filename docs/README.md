# Spekrym-FX — Planning & Development Docs

Index for the `docs/` suite: the architecture, per-context detail, decisions, contracts, and the phased frontend/backend build plans for evolving Spekrym-FX into a strategy-agnostic quantitative research & market-intelligence platform. **These are planning docs — not an authorization to build.** Status as of 2026-10-22: nothing in this programme is built yet; the existing product (Scan cockpit, DESK DK0–19, the `engine/` research spine) is the baseline.

## Read in this order
1. **[INTEGRATION_DESIGN.md](./INTEGRATION_DESIGN.md)** — the original integration design + the real code audit; how the new modules connect to what exists, with the honest findings (no proven edge; strategy-agnostic; reuse the Judge).
2. **[MASTER_DEVELOPMENT_PLAN.md](./MASTER_DEVELOPMENT_PLAN.md)** — the whole build: 8 bounded contexts, 3 foundational contracts, the 8 canonical records, and the phased plan in Waves 0–9. The spine everything else elaborates.
3. **[contexts/](./contexts/README.md)** — one deep-dive per bounded context (mission · current state · components · contracts · interfaces · guardrails · phases · tests · open decisions · cross-links), each verified against the repo.
4. **[DECISIONS.md](./DECISIONS.md)** — the 12 open decisions (10 blueprint + cost model + reference line) with recommended defaults. **Resolve these before sequencing any build.**
5. **[CONTRACTS.md](./CONTRACTS.md)** — the field-level schema source of truth that frontend (zod) and backend (pydantic) both derive from; EXISTS/EXTEND/NEW tagged with code citations.
6. **Build plans** — split frontend/backend, each a DESIGN + PHASES pair (mirrors the DESK docs):
   - Frontend: **[FRONTEND_DESIGN.md](./FRONTEND_DESIGN.md)** · **[FRONTEND_PHASES.md](./FRONTEND_PHASES.md)**
   - Backend: **[BACKEND_DESIGN.md](./BACKEND_DESIGN.md)** · **[BACKEND_PHASES.md](./BACKEND_PHASES.md)**

## The documents at a glance
| Doc | Purpose |
|---|---|
| INTEGRATION_DESIGN.md | Integration design + audit + traceability + honest risks |
| MASTER_DEVELOPMENT_PLAN.md | Full architecture + Waves 0–9 phased plan |
| contexts/ (8 + index) | Per-bounded-context detail (Data Foundation · Market Intelligence · Scenario · Research OS · Strategy/Trade/Portfolio · Safety/Execution · Visual Intelligence · Experience Plane) |
| DECISIONS.md | 12 open decisions + recommended defaults (living log) |
| CONTRACTS.md | Canonical schemas (FE zod ↔ BE pydantic parity) |
| FRONTEND_DESIGN / FRONTEND_PHASES | Frontend build: UX/architecture + phases F0–F22 (FM0–FM5, gates GF1–GF3) |
| BACKEND_DESIGN / BACKEND_PHASES | Backend build: architecture + phases B0–B31 (BM0–BM8, gates GB1–GB3) |
| SCAN_CONTRACT.md | Existing Scan HTTP contract (preserve; `/api/v1` is additive) |
| state-classification.md | Store classification (G/W/V/E) for the sync layer |

## Build order (when it starts)
**Decisions first** (`DECISIONS.md`, D1 cost model gates comparability) → **frontend, mock-first** (`FRONTEND_PHASES.md`, F0 → F22, against `CONTRACTS.md`) → **backend** (`BACKEND_PHASES.md`, B0 → B31, implementing the same contracts; each surface flips to `api` as its endpoint lands). One phase per session: finish → verify (typecheck/test/build or `pytest`) → report files → STOP.

## Cross-cutting rules (bind every doc & phase)
One canonical market clock / point-in-time model · the **Judge** is the sole verdict authority (LLMs propose, never self-certify) · the **VAULT** + live risk gates are backend-enforced, server-side · strategy/portfolio authorization is separate from research approval (risk may veto) · the **five evidence types** — Object · Insight · Scenario · Signal · Order — are never interchangeable · every chartable statement resolves to real geometry (never invented) · the same records drive live/replay/export (versioning never rewrites history) · **reuse, don't fork** (no second Judge/TA stack/cost model) · complexity lives inside the system, not the trader's experience.

## Background / source material (repo root & frontend)
Research reality the plan respects: `SYSTEM_DOSSIER.md`, `DEVELOPMENT_ROADMAP.md`, `NO_INTRADAY_EDGE.md`, `SCALP_FINDINGS.md`, `STRATEGY_FORENSICS.md`, `BACKTEST_INTEGRITY_AUDIT.md`. Existing module designs: `frontend/DESK_DESIGN.md` + `frontend/DESK_PHASES.md` (DK0–21, the built DESK scope and the format these build docs mirror), `frontend/MASTER_ROADMAP.md`, `RELAY_DESIGN.md` + `RELAY_PHASES.md`. Source inputs: `forex_trading_intelligence_system_plan.docx`, `Spekrym_FX_Unified_System_Blueprint.docx` (both in ~/Downloads).
```
Reading map:  INTEGRATION_DESIGN → MASTER_DEVELOPMENT_PLAN → contexts/ → DECISIONS → CONTRACTS → FRONTEND_{DESIGN,PHASES} → BACKEND_{DESIGN,PHASES}
```
