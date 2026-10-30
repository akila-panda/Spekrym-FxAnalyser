# Spekrym-FX DESK — Design (UI/UX, theme, features)

**Companion to** `DESK_PHASES.md`. Date: 2026-10-12. Condensed from the DESK planning pack.
Extends `FRONTEND_DEV_DESIGN.md` (principles, motion, a11y). Where silent, that file applies.

---

## 0. Vision
Desk is not another indicator dashboard. It is an **adaptive top-down analysis environment**: map the
market, decide what matters, record the thesis, export a clean plan to TradingView, learn from the result.
Three promises: **Adaptive** (one workspace, three complexity levels — simplifying changes presentation,
never truth) · **Evidence-first** (every object answers "why am I seeing this, and when was it knowable?";
no future leakage) · **Decision-to-review loop** (thesis + evidence + outcome saved together; decisions
judged separately from results). Desk *consumes* Scan's strengths (MTF stack, annotations, causality); it
does not replace Scan, which stays the strategy lab.

## 1. Information architecture
```
Spekrym-FX
├─ Scan                 (existing; unchanged)
└─ Desk                 (new app-level switch — "Scan | Desk" in the header)
   ├─ MY DESK           (default landing: personal, methodology-driven)
   │   ├─ Prepare       (pre-session top-down walk W→D→H4→H1→M15→M5→M1)
   │   ├─ Live          (during session: map + Market Change Feed + readiness)
   │   └─ Review        (journal, scorecard, replay, evidence timeline)
   └─ Analysis          (free chart workspace: any pair/TF, all layers, no checklist)
```
**Orthogonal controls (never a 3×3 matrix):** Workflow (Prepare/Live/Review, per MY DESK) chooses default
layout + checklist · Complexity (Minimal/Standard/Advanced, global) filters widgets + object caps · Focus
(on/off + named sets) hides chrome only · Simplify (toggle) jumps to Minimal and back. Layouts remembered
per workflow, never per complexity. URL: `?app=desk&desk=my|analysis&wf=prepare|live|review`. Scan↔Desk
keeps pair + timezone and never loses analysis/selection/position.

## 2. Theme & tokens
Use `styles/tokens.css` **only** — no new colours. New stylesheet `styles/desk.css`, class prefix `dk-`.
One accent: existing **`--accent` gold `#d8bc7a`** (tokens.css is source of truth; the older `#4ea1ff` note
is superseded). Shape + text carry meaning, never colour alone. Radius 3/6/999; elevation = hairline border,
shadow only on popovers. Numbers in mono tabular. Dark default + light via `data-theme`.

**Units rule (locked):** detection runs in **ATR under the hood** (volatility-adaptive, so one
methodology works across pairs/TFs/sessions), but the UI **displays distances in pips** — the
trader-facing readout is pips, with ATR shown secondary where useful (e.g. "swept 8.3 pips · 1.4 ATR").
Pips are also used for fixed references (round numbers 00/50, `PAIR_META` pip size). A unit switch is
deferred to the Methodology editor (DK17).

**Desk object → existing role token (no new colours):**
| Object | role | token |
|---|---|---|
| S/R band | `range` | `--role-range` |
| Supply / Demand | `premium_discount` (bear/bull) | `--role-premium` / `--role-discount` |
| Order block | `order_block` | `--role-order-block` |
| Liquidity pool / sweep | `liquidity` / `sweep` | `--role-liquidity` / `--role-sweep` |
| FVG | `imbalance` (bull/bear) | `--role-fvg-bull/bear` |
| Structure / swings / trendline | `structure` (trendline dashed) | `--role-structure` |
| Context rows, reference levels | `context` | `--role-context` |

## 3. Complexity levels (one axis, via widget `minLevel` + object caps)
| | Minimal | Standard (default) | Advanced |
|---|---|---|---|
| Chrome | header strip only | collapsible docks | all docks + popouts |
| Charts | 1 TF + 1 quiet HTF row | MTF stack ≤ 4 rows | ≤ 7 rows |
| Objects | ≤ 3 total | per-layer cap 8 | per-layer cap 20 |
| Brief | card (state·context·next level·invalidation) | card + drawer | card + full factors |
| Evidence depth | headline | + explanation | + evidence/lifecycle/relations |

**Progressive disclosure:** `describe(obj, depth)` → headline / explanation / evidence. Same id, same data,
three presentations. **Simplify:** saves level+Focus, jumps to Minimal, restores exactly; never removes
pinned warnings. **Pinned warnings (never hidden by Simplify/Focus):** thesis invalidation, high-impact
event < 30 min (when calendar available), stale data, "sample data". One compact icon+text strip.

## 4. Focus mode
Orthogonal to complexity. Hides all widgets except the user's Focus set + header chrome. Several named sets
per workflow. `F` toggles; a **visible Restore button** always remains (not edge-peek only); `Esc` restores.
Pinned warnings stay. Sets persist; on/off does not.

## 5. Layers panel
Six layers: **Structure · Key levels · Supply & demand · Liquidity · FVGs/imbalances · Price action**
("n of 6 visible"). Per layer: visibility, source TFs, lookback, min significance, max objects, show
tested/mitigated/invalid, project-from-HTF. Presets (presentation only, never change calc): **Market Map ·
Liquidity · Price Action · Execution · Show all · Reset to core.** Settings open as a popover from the layer
row (no global settings screen). Reuses the `hiddenGroups` model from `annotations/visibility.ts`.

## 6. Chart behaviour
Reuse the MTF stack, `RowsMenu`/`rowsStore`, shared crosshair. **Native objects** drawn normally;
**projected objects** (from a higher TF) drawn **quiet** — faint, thinner, short source-TF badge (`D`,`H4`);
a daily zone on M5 must never read as an M5 zone. Hover shows source TF, `known_at`, state; click selects +
opens the evidence drawer. As-of readout always visible when not "latest"; **nothing after as-of is drawn**.
Switching TF keeps pair + price region + time position coherent.

**Glyphs (shape + text, not colour only):** sweep `✕ SWEEP` · close-beyond `▲/▼ BREAK` · `BOS` line ·
`CHoCH` dashed · FVG hatched band · S/R solid band with touch count · S/D filled band with `S`/`D` · projected
objects carry a source-TF badge.

## 7. Evidence drawer — "Why am I seeing this?"
Right drawer, key `E` for the selected object, `Esc` closes. Sections: **Supports · Conflicts · Timing &
lifecycle · Data quality · Relations.** Data quality states source, `sample`/`live`, last update, and
unavailable inputs. Reads only the object's own data.

## 8. Prepare walk
Step rail **W · D · H4 · H1 · M15 · M5 · M1**; each step shows that TF's native objects + quiet HTF
projection. `[` `]` move between TF steps; `J`/`K` through the inbox; `Y` accept, `N` reject, `R` revisit;
undo. Custom levels (label, group, notes). A step is "reviewed" when marked or fully triaged; checklist
auto-ticks (overridable). Output: an **immutable snapshot** (accepted/rejected ids, notes, `rulesVersion`,
as-of, sample/live).

## 9. Decision Brief card
States: **Waiting · Watching · Ready to review · Invalidated**, plus **No actionable setup** and
**Insufficient evidence** as first-class honest outcomes. Four answers, each linking to an object:
current context · what matters now · what would confirm · what would invalidate. **Never says buy/sell.**

## 10. Live workflow
**Market Change Feed:** chronological, meaningful events only (entered zone, swept pool, FVG formed,
structure break, invalidation); each row = time (`known_at`) · what · where · chart link; acknowledge/
dismiss/note; `aria-live="polite"`. **Readiness chain** (methodology-configured, needs OQ-1): e.g.
HTF zone entered → LTF sweep → LTF CHoCH/BOS → LTF FVG; each step pending / seen@time / failed, explaining
what's missing. Original thesis shown unchanged beside "what changed since".

## 11. Keyboard map (assert no conflicts over `SHORTCUTS`, Desk grouping)
Existing: `J K` setups · `[ ]` step · `1–5` focus chart · `Y N R` review · `M` maximise · `Esc` ·
`Ctrl/⌘ K` palette · `?` sheet. **Desk adds (Desk context only):** `F` Focus · `S` Simplify · `E` Evidence ·
`H` MY DESK · `A` Analysis · `P`/`L`/`V` Prepare/Live/Review · `[ ]` TF step · `J K` inbox · `Y N R` triage.
Never fire while typing (`isTyping`). Every command mirrors a visible control.

## 12. States, honesty, copy
Labels: **"Sample"** on every mock-fed surface + exports · **"Heuristic"** on scores · **"Exploratory"** on
statistics · **"Potential"** on pools. "Forming" is never used for detected objects. Empty states explain
the fix ("No levels proposed — widen lookback or lower min significance"). Errors/staleness = inline strip
with retry, never a blank widget. Copy is neutral — "price entered zone", never "reversal likely"; no
probability language. Loading = skeleton rows, no layout shift; detection > 150 ms shows a progress hint.

## 13. Accessibility
Real buttons, labelled controls, visible focus (existing tokens), `aria-live` for the feed, dialogs trap
focus (follow `ShortcutsSheet`). Every object keyboard-reachable (inbox + "next object on chart"). AA
contrast dark + light; no meaning by colour alone. Reduced motion = instant (no animated replay/drawers).
Touch targets ≥ 32px; Minimal is the small-screen default below a width threshold.

## 14. Five-second tests (must pass from Minimal & Standard)
1. Which pair, what's the bias, what matters next? 2. Is this data sample or live? 3. Why is this zone here
and when was it known? 4. How do I get back from Focus? 5. What would invalidate this idea?
