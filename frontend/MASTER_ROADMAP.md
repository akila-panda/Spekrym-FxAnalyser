# Spekrym-FX — Master Roadmap (integrated order)

**Date:** 2026-10-07. Single source for *what we build next and in what order*, across all open tracks.
One phase per session; finish → verify → report files → WAIT.

## Tracks in play
- **W** — Multi-window / multi-monitor (`MULTIWINDOW_MTF_PLAN.md`, Track A).
- **S** — Time-aligned MTF stack (`MULTIWINDOW_MTF_PLAN.md`, Track B) — using the corrected
  **Focus + per-TF ViewportPolicy** model (not one shared range) salvaged from the spec review.
- **E** — Harvested enhancements (`ENHANCEMENTS_PLAN.md`): R = backend research, X = frontend diagnostics.
- **Core** — still-open original phases: **12** (UX polish, paused) and **13** (real API; you deferred the cost-model decision).

## Adopted corrections (from the external review, folded in)
- **P0 state-classification table before any sync** (classify every store field global/window/view/ephemeral; **layout is window-scoped, never replicated**).
- **Focus/ViewportPolicy** replaces "shared `[from,to]`" for the stack (D→M1 1440:1 makes one range unusable).
- **Sync rigor:** per-slice revisions, LOCAL/REMOTE/DERIVED tags + `applyingRemote`, Web-Locks leader for snapshot, scan-ownership lock, heartbeat presence, split **W3 → W3a/W3b**.
- **S2.5 lightweight-charts spike** before crosshair/drill.
- Stack reads candles **causally** (forming parent = snapshot; boundaries from real parent bars; `×N` = actual children).

---

## Recommended sequence

Rationale: deliver the **two UI features you asked for first** (that's the ask), front-load the
one prep phase both features need, slot the **cheap backend integrity wins** where they don't
block UI, and leave strategic/decision-gated work (Core 13) for a deliberate choice later.

### Stage 0 — Prep (1 phase)
1. **P0** — repo recon + `docs/state-classification.md` + confirm D/W in the TF set + `docs/DEVIATIONS.md`. *Prereq for all W and S work. No code changes.*

### Stage 1 — Multi-window spine
2. **W1** window-role routing (incl. `stack` role) · 3. **W2** sync protocol (pure) · 4. **W3a** BroadcastChannel + `viewStore` · 5. **W3b** remaining stores + snapshot/leader + heartbeat.
→ *Two windows stay in sync; nothing popped out yet.*

### Stage 2 — MTF stack core (the feature you described in detail)
6. **S1** add D/W to chart set · 7. **S2** alignment math (pure: parent boundaries, active-parent span, child counts) · 8. **S2.5** lwc spike (findings doc) · 9. **S3** stack layout + Focus/ViewportPolicy + range-sync loop guard.
→ *Vertical D→M1 column follows one focus.*

### Stage 3 — MTF stack richness
10. **S4** parent brackets + active-parent shading + `×N` · 11. **S5** shared time crosshair · 12. **S6** click-to-drill + DrillHistory + breadcrumb.
→ *"See the 12 M5 candles inside this H1," and drill into any candle.*

### Stage 4 — Multi-window completion (now the stack can live on monitor 2)
13. **W4** pop-out UX + Windows menu · 14. **W5** cross-window crosshair/selection sync.

### Stage 5 — Two-monitor placement
15. **W6** Window Management API placement + fallback · 16. **W7** workspaces (save/restore role→screen).

### Stage 6 — Polish
17. **S7** stack polish (session boundaries, annotation flow-through, perf cap, a11y) · 18. **Core 12** general UX polish (settings, empty/error states, keyboard).

### Parallel backend track (slot any time — never blocks UI)
- **E3** negative-control oracles · **E4** `dataVersion` in ledger · **E1** session calendar (also fixes H4/D anchor).
  Suggested: do **E3 + E4** as quick wins early (even before/between Stage 1), then **E1**. *(E2 ATR-unit params dropped — pips work fine as-is.)*

### Opportunistic frontend win
- **E6** "Explain this setup" panel — independent of W/S; good to drop in after **Stage 2** for a visible UX boost while the stack settles. **E7/E8** later.

### Decision-gated (not scheduled yet)
- **Core 13** real API + cost-model reconciliation — you deferred the cost-model choice. Revisit after the UI features; it mainly matters once scans run on real ingested data across windows.
- **E5** developing-vs-confirmed — build with the first structure emitter.

---

## One-line order (default path)
`P0 → (E3,E4) → W1 → W2 → W3a → W3b → S1 → S2 → S2.5 → S3 → E6 → S4 → S5 → S6 → W4 → W5 → E1 → W6 → W7 → S7 → Core12 → [decide Core13] → E7/E8/E5`

## Working rules (every phase)
One phase at a time · pure logic → wiring → chrome · additive & backwards-compatible (no `?window=` and stack off ⇒ unchanged) · typecheck+tests+build+runtime green · report only files created/modified · never auto-start the next phase.
