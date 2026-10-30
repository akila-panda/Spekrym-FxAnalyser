/** F8 — Explore: engine toggles + hand-off to Analysis. Pure. Toggles are PRESENTATION ONLY: they filter
 *  the already-composed overlays and never touch detection (composeCanvas output is unchanged). An overlay
 *  stays visible while ANY of its contributing engines is on; P0 overlays (safety/invalidation) are never
 *  hidden by a toggle. */
import { encodeState } from "@/url/urlState";
import type { Pair } from "@/types/market";
import type { ComposedOverlay } from "../pipeline";

export interface EngineInfo {
  id: string;
  /** Overlays this engine contributes to (before toggles). */
  count: number;
  /** True if it contributes to a P0 overlay (its toggle can't hide that overlay). */
  hasP0: boolean;
}

/** Distinct engines (sourceModules) across the composed overlays, sorted by id. */
export function listEngines(overlays: readonly ComposedOverlay[]): EngineInfo[] {
  const m = new Map<string, EngineInfo>();
  for (const o of overlays) {
    for (const id of o.sources) {
      const e = m.get(id) ?? { id, count: 0, hasP0: false };
      e.count += 1;
      if (o.priority === 0) e.hasP0 = true;
      m.set(id, e);
    }
  }
  return [...m.values()].sort((a, b) => a.id.localeCompare(b.id));
}

/** Display filter. Returns a new array; never mutates input or recomputes detection. */
export function applyEngineToggles(overlays: readonly ComposedOverlay[], hidden: readonly string[]): ComposedOverlay[] {
  if (hidden.length === 0) return [...overlays];
  const off = new Set(hidden);
  return overlays.filter((o) => o.priority === 0 || o.sources.length === 0 || o.sources.some((s) => !off.has(s)));
}

/** Deep link that opens the Analysis workspace (Desk → Analysis) for a pair in a new window, so the
 *  Canvas workflow (plan, step, mode) in this window is left untouched. */
export function analysisHref(pair: Pair | string, pathname = "/"): string {
  return `${pathname}?${encodeState({ pair: pair as Pair, app: "desk", deskArea: "analysis" })}`;
}