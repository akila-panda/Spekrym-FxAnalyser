/** F5 — the guided chart-native Prepare walk: six ordered steps, each with its own overlay preset.
 *  Pure. A preset selects which composed overlays the chart shows for that step (presentation only —
 *  it never changes detection or the composed set). Step 6 narrows to the trader's selected objects. */
import type { ComposedOverlay } from "../pipeline";

export interface Preset {
  /** VisualPrimitive kinds (from F4) this step surfaces. */
  kinds?: string[];
  /** When true, show only the objects the trader has added to the plan. */
  selectedOnly?: boolean;
}

export interface PrepareStep {
  id: string;
  title: string;
  question: string;
  preset: Preset;
}

export const PREPARE_STEPS: readonly PrepareStep[] = [
  { id: "htf", title: "Higher-timeframe context", question: "Where are we in the bigger market?", preset: { kinds: ["zone", "line", "level"] } },
  { id: "levels", title: "Key levels", question: "Where has price reacted before?", preset: { kinds: ["level"] } },
  { id: "session", title: "Session intelligence", question: "What happened in Asia & London?", preset: { kinds: ["session_shade", "event_marker", "level"] } },
  { id: "structure", title: "Structure & momentum", question: "How is price behaving now?", preset: { kinds: ["line", "marker", "regime_interval"] } },
  { id: "scenarios", title: "Scenarios", question: "What could happen next?", preset: { kinds: ["path", "envelope"] } },
  { id: "plan", title: "Session plan", question: "What should I watch?", preset: { selectedOnly: true } },
] as const;

const refOf = (o: ComposedOverlay): string => o.primary.geometryRefs[0] ?? o.primary.mappingId;

/** Apply a step preset to the composed overlays. Pure; returns a filtered view (never mutates). */
export function applyPreset(overlays: readonly ComposedOverlay[], preset: Preset, selectedIds: readonly string[] = []): ComposedOverlay[] {
  if (preset.selectedOnly) {
    const sel = new Set(selectedIds);
    return overlays.filter((o) => sel.has(refOf(o)));
  }
  if (!preset.kinds || preset.kinds.length === 0) return [...overlays];
  const kinds = new Set(preset.kinds);
  return overlays.filter((o) => kinds.has(o.kind));
}

export const overlayRef = refOf;
