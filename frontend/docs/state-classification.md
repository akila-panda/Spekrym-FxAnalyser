# State classification (P0)

Classes: **G** global-shared (replicated) · **W** window-scoped (never replicated) · **V** view-scoped (per chart/TF, never replicated) · **E** ephemeral (local bookkeeping/derived, never broadcast).
Unclassified ⇒ non-shared. `layout` is **W — never replicated**.

## viewStore (`src/store/viewStore.ts`)
| Field | Class |
|---|---|
| pair | G |
| asOf | G |
| timezone | G |
| linked | G |

## panelStore (`src/panels/panelStore.ts`)
| Field | Class | Note |
|---|---|---|
| layout | W | never replicated |
| focused | W | |
| restoreTo | W | |
| localOnly | V | per-TF projection toggle; promote to G only on request |

## scanStore (`src/scan/scanStore.ts`)
| Field | Class | Note |
|---|---|---|
| strategies | G | catalog; re-fetchable |
| catalog, catalogError | E | per-window load status |
| strategyId | G | |
| params | G | |
| range | G | |
| bounds | E | refetched per window |
| panels[tf] (status/stale/result/error/chosenSetupId) | G | status mirrored so peers show "scanning" |
| tab | W | |
| filters | W | |
| active | G | |
| inputsVersion | E | local cancel counter; remote apply goes through `bump` path, never broadcast |

## annotationStore (`src/store/annotationStore.ts`)
| Field | Class | Note |
|---|---|---|
| annotations, steps | E (DERIVED) | recomputed from `scanStore.active`; never broadcast |
| step | G | replay/step position |
| hiddenGroups | W | |

## overrides (`src/annotations/overrides.ts`)
| Field | Class |
|---|---|
| trades | G |

## Non-store state
| Item | Class | Note |
|---|---|---|
| URL `ShareState` (pair, tz, linked, layout, strategy, from, to, params) | per field above | `layout` stays W |
| Presets (`localStorage` `spekrym.presets.v1`) | G (storage) | not store-synced |
| Chart instances / handles (`useChartInstance`) | V | never cross windows |
| `cursor` (future, S5/W5) | E | ephemeral topic |
| `Focus`/`DrillHistory` (future, S3/S6) | G (focus) · V (detached rows) | decide at S3 |

## Cross-store couplings (affect W3)
- `scanStore` ← `viewStore.pair` subscription ⇒ `markStale` (DERIVED on remote apply).
- `scanStore` → `annotationStore` subscription (DERIVED).
- `scanStore.activate` writes `viewStore.asOf` (LOCAL mutation; broadcasts via view slice).

| `Focus`/`DrillHistory` (`src/stack/focusStore.ts`, S3) | W for now (not bound; may become G at W5/W7) | decided at S3: window-scoped until cross-window selection sync |
| `detached` rows (`focusStore`, S3) | V | per row, never replicated |

### DESK module (DK0+) — all local, never replicated; never bound in `sync/`
| Field / store | Class | Persistence | Note |
|---|---|---|---|
| Analytical objects / relations (`desk/detect/registry` memo) | analytical (derived) | none | recomputed via `viewAsOf`; never stored |
| Decisions accept/reject/notes (`desk/decisions/decisionStore`) | user decision | `spekrym.desk.decisions.v1` | `decided_at` lives here, not on the object |
| Snapshots / plans (`desk/prepare/snapshotStore`, `desk/plan/planStore`) | snapshot | `spekrym.desk.snapshots.v1` / `.plans.v1` | immutable; accepted objects stored in full |
| Change Feed triage — acknowledge / dismiss / note (`desk/live/liveStore`) | user decision | `spekrym.desk.live.v1` | keyed by event id; local only, never replicated |
| Methodology (`desk/methodology/methodologyStore`) | methodology | `spekrym.desk.methodology.v1` | versioned; old snapshots keep their `rulesVersion` |
| Preferences / workspace (`desk/workspace/deskStore`) | preference | `spekrym.desk.workspace.v1` | complexity, per-workflow layouts, focus sets |
| Ephemeral (selected object, hover, drawer, Focus on/off, `deskUiStore.asOf`) | ephemeral | none | Desk's own as-of clock; **never writes `viewStore.asOf`** |
| `viewStore.pair/timezone` | existing replicated (G) | existing | Desk **reads** these; does not write `asOf` || Trade plans (`desk/plan/planStore`) | user decision | `spekrym.desk.plans.v1` | one per pair+date, editable until recorded; local only, never replicated |
| Journal entries + outcomes (`desk/plan/journalStore`) | user decision | `spekrym.desk.journal.v1` | entries immutable (add-only); outcomes attached separately; local only, never replicated |
| Methodology overrides + version history (`desk/methodology/methodologyStore`) | methodology | `spekrym.desk.methodology.v1` | sparse overrides over `DEFAULTS`; each distinct config = one `rulesVersion`; old versions stay resolvable; local only, never replicated |