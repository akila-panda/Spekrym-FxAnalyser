# Spekrym-FX Frontend — session rules

Frontend-only build (`frontend/`) of the Spekrym-FX intelligence platform, **phased, one phase per session**, built **mock-first against `docs/CONTRACTS.md`** (no backend needed). Read `docs/FRONTEND_PROGRESS.md` first to find the next phase.

## Commands (run from `frontend/`)
- `npm ci` (first time; `node_modules` is not in the zip)
- `npm run typecheck` · `npm test` · `npm run build` — all must pass before a phase is done. Run once at the end (`| tail`).

## Phase protocol
- Build only the **next** phase in `docs/FRONTEND_PHASES.md` (status in `docs/FRONTEND_PROGRESS.md`).
- Finish → verify (typecheck + test + build green) → update `docs/FRONTEND_PROGRESS.md` → report **files created / modified only** → **STOP and wait** for `next`/`proceed`. Do not auto-start the next phase.

## Definition of done (every phase)
- typecheck + test + build green; new logic has tests.
- Builds against **mock sources + frozen fixtures** conforming to `docs/CONTRACTS.md`. **No backend / API / DB / Python.**
- Causal surfaces respect `availableAt`/`viewAsOf` (nothing renders before it was knowable).
- **No new colours** — reuse `styles/tokens.css` `--role-*`/`--accent`.
- **Scan + DESK (DK0–DK19) behaviour unchanged — their tests stay green.**
- Every new UI element keyboard-reachable + accessible name + non-colour cue; mock surfaces show "sample".
- The 5 evidence types (Object/Insight/Scenario/Signal/Order) stay visually distinct; discretionary ≠ validated; P0 safety/invalidation overlays never hidden; no fabricated probabilities.

## Do NOT touch
- `sync/` bindings (no new replicated store without a `docs/state-classification.md` row), `scan/` behaviour, any Python / `backtest/` / `research/`.
- New stores are local (`spekrym.desk.<name>.v1`) unless a classification row says otherwise (durable plans/decisions/snapshots only).

## Where things are
- Intelligence contracts + mocks + fixtures: `src/intel/` (`@/intel`). Canvas: `src/desk/canvas/` (shell + `chart-mapping` + `overlay-manager`, more per phase). Engine objects: `DeskSource.getEngineObjects` (mock). Window roles: `src/window/role.ts` (Canvas = role `canvas`).
- Reference: `frontend/DESK_DESIGN.md` + `frontend/DESK_PHASES.md` (the frontend docs extend these). Contracts: `docs/CONTRACTS.md`. Decisions: `docs/DECISIONS.md` (all confirmed).

## Session start
Read: `docs/FRONTEND_PROGRESS.md` (next phase) + that phase block in `docs/FRONTEND_PHASES.md` + the relevant `docs/FRONTEND_DESIGN.md` section + the `docs/CONTRACTS.md` record(s). Prefer small files (< 250 lines); frozen fixtures over inline arrays.
